import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Platform, Modal, KeyboardAvoidingView, Alert, Linking, Image,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '@/lib/auth-context';
import { getQueryFn, apiRequest, queryClient, getApiUrl } from '@/lib/query-client';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset } from '@/constants/theme';

async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

const PORTFOLIO_COLORS = [
  '#1E3A5F', '#2D1B4E', '#1B4332', '#4A1942', '#3D2B1F',
  '#1A3C40', '#2C1654', '#3B1F2B', '#1F3D0C', '#2B2D42',
];

const MEDIA_TYPE_OPTIONS = [
  { value: 'photographer', label: 'Photographer' },
  { value: 'videographer', label: 'Videographer' },
  { value: 'drone', label: 'Drone' },
  { value: 'social_content', label: 'Social Content' },
];

async function uploadPhotoToCloud(compressedUri: string, onStatus?: (s: string) => void): Promise<string> {
  onStatus?.('Preparing...');
  const baseUrl = getApiUrl();
  const sigUrl = new URL('/api/uploads/signature', baseUrl).toString();
  const sigRes = await fetch(sigUrl, { credentials: 'include' });

  if (sigRes.ok) {
    const { timestamp, signature, cloud_name, api_key, folder } = await sigRes.json() as {
      timestamp: number; signature: string; cloud_name: string; api_key: string; folder: string;
    };

    onStatus?.('Uploading...');
    const cloudFormData = new FormData();
    if (Platform.OS === 'web') {
      const response = await fetch(compressedUri);
      const blob = await response.blob();
      cloudFormData.append('file', blob, `photo_${Date.now()}.jpg`);
    } else {
      cloudFormData.append('file', {
        uri: compressedUri,
        name: `photo_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);
    }
    cloudFormData.append('timestamp', String(timestamp));
    cloudFormData.append('signature', signature);
    cloudFormData.append('api_key', api_key);
    cloudFormData.append('folder', folder);

    const cloudRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
      { method: 'POST', body: cloudFormData },
    );

    if (!cloudRes.ok) {
      throw new Error('Upload to cloud storage failed');
    }

    const cloudData = await cloudRes.json() as { secure_url: string };
    return cloudData.secure_url;
  }

  onStatus?.('Uploading...');
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(compressedUri);
    const blob = await response.blob();
    formData.append('file', blob, `photo_${Date.now()}.jpg`);
  } else {
    formData.append('file', {
      uri: compressedUri,
      name: `photo_${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as any);
  }

  const uploadUrl = new URL('/api/uploads', baseUrl).toString();
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    const msg = (errData as any).code === 'UPLOADS_NOT_CONFIGURED'
      ? 'Uploads are not configured. Please contact the administrator.'
      : (errData as any).message || 'Upload failed';
    throw new Error(msg);
  }

  const { url } = await uploadRes.json() as { url: string };
  return url;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, refetchUser } = useAuth();
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const { data: portfolio = [] } = useQuery<any[]>({
    queryKey: ['/api/portfolio', user?.id],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user?.id,
  });

  const { data: packages = [], refetch: refetchPackages } = useQuery<any[]>({
    queryKey: ['/api/packages', user?.id],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user?.id,
  });

  const { data: myAttendance = [] } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const socialLinks = (() => {
    try { return JSON.parse(user?.socialLinks || '{}'); } catch { return {}; }
  })();

  const isDriverEnabled = user?.isDriverEnabled ?? (user?.primaryRole === 'driver');
  const isCreatorEnabled = user?.isCreatorEnabled ?? (user?.primaryRole === 'creator');

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const handleAvatarPress = () => {
    Alert.alert('Profile Photo', 'Change your profile picture', [
      {
        text: 'Choose Photo',
        onPress: handleChoosePhoto,
      },
      {
        text: 'Remove Photo',
        style: 'destructive',
        onPress: handleRemovePhoto,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleChoosePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library permission is required to upload images');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      setAvatarUploading(true);
      const compressedUri = await compressImage(asset.uri);
      const url = await uploadPhotoToCloud(compressedUri);
      await apiRequest('PUT', '/api/profile', { profileImage: url });
      refetchUser();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      await apiRequest('PUT', '/api/profile', { profileImage: '' });
      refetchUser();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not remove photo');
    }
  };

  const handleDeletePortfolioItem = async (item: any) => {
    Alert.alert('Delete Item', 'Remove this portfolio item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await apiRequest('DELETE', `/api/portfolio/${item.id}`);
            queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
          } catch (err) {
            console.error(err);
          }
        },
      },
    ]);
  };

  const handleDeletePackage = async (pkg: any) => {
    Alert.alert('Delete Package', `Remove "${pkg.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await apiRequest('DELETE', `/api/packages/${pkg.id}`);
            queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
          } catch (err) {
            console.error(err);
          }
        },
      },
    ]);
  };

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;
  const hasProfileImage = !!user?.profileImage;

  const carsArray = user?.cars ? user.cars.split(',').map((c: string) => c.trim()).filter(Boolean) : [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPadding + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={22} color={Colors.dark.textMuted} />
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <Pressable onPress={handleAvatarPress} style={styles.avatarWrapper}>
            {hasProfileImage ? (
              <Image source={{ uri: user.profileImage! }} style={styles.profileAvatarImage} />
            ) : (
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.primaryDark]}
                style={styles.profileAvatar}
              >
                <Text style={styles.profileAvatarText}>
                  {(user?.displayName || 'U')[0].toUpperCase()}
                </Text>
              </LinearGradient>
            )}
            {avatarUploading && (
              <View style={styles.avatarLoadingOverlay}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </Pressable>

          <Text style={styles.profileName}>{user?.displayName}</Text>

          <View style={styles.roleBadgesRow}>
            {isDriverEnabled && (
              <View style={styles.roleBadge}>
                <Ionicons name="car-sport" size={14} color={Colors.dark.primary} />
                <Text style={styles.roleBadgeText}>Driver</Text>
              </View>
            )}
            {isCreatorEnabled && (
              <View style={[styles.roleBadge, styles.creatorBadge]}>
                <Ionicons name="camera" size={14} color={Colors.dark.accent} />
                <Text style={[styles.roleBadgeText, { color: Colors.dark.accent }]}>Creator</Text>
              </View>
            )}
          </View>

          {user?.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.locationText}>{user.location}</Text>
            </View>
          ) : null}
        </View>

        <Pressable onPress={() => setShowEditModal(true)} style={styles.editProfileBtn}>
          <Ionicons name="create-outline" size={18} color={Colors.dark.primary} />
          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
        </Pressable>

        {user?.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{user.bio}</Text>
          </View>
        ) : null}

        {isDriverEnabled && user?.driverBio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driver Bio</Text>
            <Text style={styles.bioText}>{user.driverBio}</Text>
          </View>
        ) : null}

        {isCreatorEnabled && user?.creatorBio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Creator Bio</Text>
            <Text style={styles.bioText}>{user.creatorBio}</Text>
          </View>
        ) : null}

        {isDriverEnabled && user?.carInfo ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Car</Text>
            <View style={styles.carCard}>
              <Ionicons name="car-sport" size={20} color={Colors.dark.primary} />
              <Text style={styles.carText}>{user.carInfo}</Text>
            </View>
          </View>
        ) : null}

        {isDriverEnabled && carsArray.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cars</Text>
            <View style={styles.tagRow}>
              {carsArray.map((car: string, i: number) => (
                <View key={i} style={styles.carTag}>
                  <Ionicons name="car-sport-outline" size={14} color={Colors.dark.primary} />
                  <Text style={styles.carTagText}>{car}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {isCreatorEnabled && user?.mediaTypes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specialties</Text>
            <View style={styles.tagRow}>
              {user.mediaTypes.split(',').map((type: string) => (
                <View key={type} style={styles.tag}>
                  <Text style={styles.tagText}>{type.replace('_', ' ')}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {isCreatorEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Portfolio</Text>
              <Pressable onPress={() => setShowPortfolioModal(true)}>
                <Ionicons name="add-circle-outline" size={22} color={Colors.dark.primary} />
              </Pressable>
            </View>
            {portfolio.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>No portfolio items yet</Text>
              </View>
            ) : (
              <View style={styles.portfolioGrid}>
                {portfolio.map((item: any, index: number) => {
                  const hasRealImage = item.mediaType === 'photo' && item.mediaUrl && item.mediaUrl !== 'photo_placeholder';
                  const imageUrl = hasRealImage
                    ? (item.mediaUrl.startsWith('http') ? item.mediaUrl : `${getApiUrl()}${item.mediaUrl}`)
                    : null;

                  return (
                    <View key={item.id} style={styles.portfolioItem}>
                      <View style={[styles.portfolioCard, !imageUrl && { backgroundColor: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }]}>
                        {imageUrl ? (
                          <Image source={{ uri: imageUrl }} style={styles.portfolioImage} />
                        ) : (
                          <Ionicons
                            name={item.mediaType === 'external_video' ? 'play-circle' : 'camera'}
                            size={28}
                            color="rgba(255,255,255,0.6)"
                          />
                        )}
                        {item.mediaType === 'external_video' && (
                          <View style={styles.portfolioVideoOverlay}>
                            <Ionicons name="play-circle" size={20} color="#fff" />
                          </View>
                        )}
                        {item.caption ? (
                          <Text style={[styles.portfolioCaption, imageUrl && styles.portfolioCaptionOverImage]} numberOfLines={2}>{item.caption}</Text>
                        ) : null}
                        <Pressable
                          style={styles.portfolioDeleteBtn}
                          onPress={() => handleDeletePortfolioItem(item)}
                        >
                          <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {(socialLinks.instagram || socialLinks.youtube || socialLinks.tiktok) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Social</Text>
            <View style={styles.socialRow}>
              {socialLinks.instagram ? (
                <View style={styles.socialItem}>
                  <Ionicons name="logo-instagram" size={20} color="#E1306C" />
                  <Text style={styles.socialText}>@{socialLinks.instagram}</Text>
                </View>
              ) : null}
              {socialLinks.youtube ? (
                <View style={styles.socialItem}>
                  <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                  <Text style={styles.socialText}>{socialLinks.youtube}</Text>
                </View>
              ) : null}
              {socialLinks.tiktok ? (
                <View style={styles.socialItem}>
                  <Ionicons name="logo-tiktok" size={20} color={Colors.dark.text} />
                  <Text style={styles.socialText}>@{socialLinks.tiktok}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ── Stripe Payout Setup (creator only) ───────────────────────────── */}
        {isCreatorEnabled && <StripePayoutSetup />}

        {isCreatorEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Packages</Text>
              <Pressable onPress={() => setShowPackageModal(true)}>
                <Ionicons name="add-circle-outline" size={22} color={Colors.dark.primary} />
              </Pressable>
            </View>
            {packages.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptyText}>No packages yet</Text>
              </View>
            ) : (
              packages.map((pkg: any) => (
                <View key={pkg.id} style={styles.packageCard}>
                  <View style={styles.packageInfo}>
                    <Text style={styles.packageTitle}>{pkg.title}</Text>
                    {pkg.description ? (
                      <Text style={styles.packageDesc} numberOfLines={2}>{pkg.description}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.packagePrice}>${pkg.price}</Text>
                  <Pressable
                    onPress={() => handleDeletePackage(pkg)}
                    style={styles.packageDeleteBtn}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.dark.error} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attending Events</Text>
          {myAttendance.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptyText}>Not attending any events</Text>
            </View>
          ) : (
            myAttendance.map((att: any) => (
              <Pressable
                key={att.id}
                onPress={() => att.event && router.push(`/event/${att.event.id}`)}
                style={styles.attendanceCard}
              >
                <View style={styles.attendanceInfo}>
                  <Text style={styles.attendanceName}>{att.event?.name || 'Event'}</Text>
                  <Text style={styles.attendanceLocation}>{att.event?.location}</Text>
                </View>
                <View style={styles.attendanceRole}>
                  <Text style={styles.attendanceRoleText}>{att.role}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <EditProfileModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        user={user}
        onSaved={() => {
          setShowEditModal(false);
          refetchUser();
        }}
      />

      <CreatePackageModal
        visible={showPackageModal}
        onClose={() => setShowPackageModal(false)}
        onCreated={() => {
          setShowPackageModal(false);
          refetchPackages();
        }}
      />

      <AddPortfolioModal
        visible={showPortfolioModal}
        onClose={() => setShowPortfolioModal(false)}
        onAdded={() => {
          setShowPortfolioModal(false);
          queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
        }}
      />
    </View>
  );
}

function EditProfileModal({ visible, onClose, user, onSaved }: {
  visible: boolean; onClose: () => void; user: any; onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [carInfo, setCarInfo] = useState('');
  const [cars, setCars] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [driverEnabled, setDriverEnabled] = useState(true);
  const [creatorEnabled, setCreatorEnabled] = useState(false);
  const [driverBio, setDriverBio] = useState('');
  const [creatorBio, setCreatorBio] = useState('');
  const [mediaTypes, setMediaTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (visible && user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setLocation(user.location || '');
      setCarInfo(user.carInfo || '');
      setCars(user.cars || '');
      setDriverBio(user.driverBio || '');
      setCreatorBio(user.creatorBio || '');
      setDriverEnabled(user.isDriverEnabled ?? (user.primaryRole === 'driver'));
      setCreatorEnabled(user.isCreatorEnabled ?? (user.primaryRole === 'creator'));
      setMediaTypes(user.mediaTypes ? user.mediaTypes.split(',').filter(Boolean) : []);
      try {
        const sl = JSON.parse(user.socialLinks || '{}');
        setInstagram(sl.instagram || '');
        setYoutube(sl.youtube || '');
        setTiktok(sl.tiktok || '');
      } catch {
        setInstagram('');
        setYoutube('');
        setTiktok('');
      }
    }
  }, [visible, user]);

  const handleToggleDriver = () => {
    if (driverEnabled && !creatorEnabled) return;
    setDriverEnabled(!driverEnabled);
  };

  const handleToggleCreator = () => {
    if (creatorEnabled && !driverEnabled) return;
    setCreatorEnabled(!creatorEnabled);
  };

  const toggleMediaType = (value: string) => {
    setMediaTypes(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setLoading(true);
    try {
      await apiRequest('PUT', '/api/profile', {
        displayName: displayName.trim(),
        bio: bio.trim(),
        location: location.trim(),
        carInfo: carInfo.trim(),
        cars: cars.trim(),
        isDriverEnabled: driverEnabled,
        isCreatorEnabled: creatorEnabled,
        driverBio: driverBio.trim(),
        creatorBio: creatorBio.trim(),
        mediaTypes: mediaTypes.join(','),
        socialLinks: JSON.stringify({
          instagram: instagram.trim(),
          youtube: youtube.trim(),
          tiktok: tiktok.trim(),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      onSaved();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.editModalContainer}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.editModalScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.editModalBody}>
              <Text style={styles.editSectionLabel}>Basic Info</Text>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Display Name</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Your name"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Bio</Text>
                <TextInput
                  style={[styles.modalInput, styles.multilineInput]}
                  placeholder="Tell others about yourself..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Location</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="City, State"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={location}
                  onChangeText={setLocation}
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Car Info</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., 2024 BMW M3"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={carInfo}
                  onChangeText={setCarInfo}
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Cars (comma-separated)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., BMW M3, Porsche 911, Tesla Model S"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={cars}
                  onChangeText={setCars}
                />
              </View>

              <Text style={styles.editSectionLabel}>Social Links</Text>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Instagram Handle</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="username"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={instagram}
                  onChangeText={setInstagram}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>YouTube Channel</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Channel name or URL"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={youtube}
                  onChangeText={setYoutube}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>TikTok Handle</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="username"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={tiktok}
                  onChangeText={setTiktok}
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.editSectionLabel}>Roles</Text>

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Ionicons name="car-sport" size={20} color={Colors.dark.primary} />
                  <Text style={styles.toggleLabel}>Enable Driver Profile</Text>
                </View>
                <Pressable
                  onPress={handleToggleDriver}
                  style={[styles.toggleTrack, driverEnabled && styles.toggleTrackActive]}
                >
                  <View style={[styles.toggleThumb, driverEnabled && styles.toggleThumbActive]} />
                </Pressable>
              </View>

              {driverEnabled && (
                <View style={styles.modalField}>
                  <Text style={styles.modalLabel}>Driver Bio</Text>
                  <TextInput
                    style={[styles.modalInput, styles.multilineInput]}
                    placeholder="Describe yourself as a driver..."
                    placeholderTextColor={Colors.dark.textMuted}
                    value={driverBio}
                    onChangeText={setDriverBio}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              )}

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Ionicons name="camera" size={20} color={Colors.dark.accent} />
                  <Text style={styles.toggleLabel}>Enable Creator Profile</Text>
                </View>
                <Pressable
                  onPress={handleToggleCreator}
                  style={[styles.toggleTrack, creatorEnabled && styles.toggleTrackActive]}
                >
                  <View style={[styles.toggleThumb, creatorEnabled && styles.toggleThumbActive]} />
                </Pressable>
              </View>

              {creatorEnabled && (
                <>
                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Creator Bio</Text>
                    <TextInput
                      style={[styles.modalInput, styles.multilineInput]}
                      placeholder="Describe yourself as a creator..."
                      placeholderTextColor={Colors.dark.textMuted}
                      value={creatorBio}
                      onChangeText={setCreatorBio}
                      multiline
                      textAlignVertical="top"
                    />
                  </View>

                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Media Types</Text>
                    <View style={styles.mediaTypeGrid}>
                      {MEDIA_TYPE_OPTIONS.map(opt => {
                        const selected = mediaTypes.includes(opt.value);
                        return (
                          <Pressable
                            key={opt.value}
                            onPress={() => toggleMediaType(opt.value)}
                            style={[styles.mediaTypeChip, selected && styles.mediaTypeChipSelected]}
                          >
                            <Text style={[styles.mediaTypeChipText, selected && styles.mediaTypeChipTextSelected]}>
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              <View style={{ height: spacing.xl }} />
            </View>
          </ScrollView>

          <Pressable
            onPress={handleSave}
            disabled={loading || !displayName.trim()}
            style={[styles.modalSubmit, (loading || !displayName.trim()) && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
              style={styles.modalSubmitGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitText}>Save Changes</Text>
              )}
            </LinearGradient>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function AddPortfolioModal({ visible, onClose, onAdded }: {
  visible: boolean; onClose: () => void; onAdded: () => void;
}) {
  const [mode, setMode] = useState<'choose' | 'photo' | 'video'>('choose');
  const [caption, setCaption] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const resetAndClose = () => {
    setMode('choose');
    setCaption('');
    setVideoUrl('');
    setError('');
    setUploadStatus('');
    setSelectedImageUri(null);
    onClose();
  };

  const handlePickPhoto = async () => {
    setError('');
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Photo library permission is required to upload images');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      if (asset) {
        setSelectedImageUri(asset.uri);
        setMode('photo');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message?.includes('permission') ? 'Photo library permission denied' : 'Failed to pick image');
    }
  };

  const handleSavePhoto = async () => {
    if (!selectedImageUri) {
      setError('No photo selected');
      return;
    }
    setLoading(true);
    setError('');
    setUploadStatus('Compressing...');
    try {
      const compressedUri = await compressImage(selectedImageUri);
      const mediaUrl = await uploadPhotoToCloud(compressedUri, setUploadStatus);

      setUploadStatus('Saving...');
      await apiRequest('POST', '/api/portfolio', {
        mediaType: 'photo',
        mediaUrl,
        caption: caption || 'Photo',
      });
      setCaption('');
      setSelectedImageUri(null);
      setUploadStatus('');
      setMode('choose');
      onAdded();
    } catch (err: any) {
      if (err.message?.includes('Network') || err.message?.includes('fetch')) {
        setError('Network error - check your connection and try again');
      } else {
        setError(err.message || 'Upload failed');
      }
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  const handleSaveVideo = async () => {
    if (!videoUrl) return;
    setLoading(true);
    setError('');
    try {
      await apiRequest('POST', '/api/portfolio', {
        mediaType: 'external_video',
        externalUrl: videoUrl,
        caption: caption || 'Video',
      });
      setCaption('');
      setVideoUrl('');
      setMode('choose');
      onAdded();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {mode === 'choose' ? 'Add to Portfolio' : mode === 'photo' ? 'Add Photo' : 'Add Video Link'}
            </Text>
            <Pressable onPress={resetAndClose}>
              <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          {mode === 'choose' && (
            <View style={styles.modalBody}>
              <Pressable style={styles.portfolioOptionBtn} onPress={handlePickPhoto}>
                <View style={styles.portfolioOptionIcon}>
                  <Ionicons name="camera" size={24} color={Colors.dark.primary} />
                </View>
                <View style={styles.portfolioOptionInfo}>
                  <Text style={styles.portfolioOptionTitle}>Add Photo</Text>
                  <Text style={styles.portfolioOptionDesc}>Pick from your gallery</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </Pressable>
              <Pressable style={styles.portfolioOptionBtn} onPress={() => setMode('video')}>
                <View style={styles.portfolioOptionIcon}>
                  <Ionicons name="videocam" size={24} color={Colors.dark.accent} />
                </View>
                <View style={styles.portfolioOptionInfo}>
                  <Text style={styles.portfolioOptionTitle}>Add Video Link</Text>
                  <Text style={styles.portfolioOptionDesc}>YouTube or Vimeo URL</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              </Pressable>
              {!!error && <Text style={styles.modalError}>{error}</Text>}
            </View>
          )}

          {mode === 'photo' && (
            <View style={styles.modalBody}>
              {selectedImageUri && (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: selectedImageUri }} style={styles.imagePreview} />
                  <Pressable
                    style={styles.changePhotoBtn}
                    onPress={handlePickPhoto}
                  >
                    <Ionicons name="swap-horizontal" size={16} color={Colors.dark.text} />
                    <Text style={styles.changePhotoText}>Change</Text>
                  </Pressable>
                </View>
              )}
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Caption</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Describe this photo..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={caption}
                  onChangeText={setCaption}
                />
              </View>
              {!!error && <Text style={styles.modalError}>{error}</Text>}
              <Pressable
                onPress={handleSavePhoto}
                disabled={loading}
                style={[styles.modalSubmit, loading && { opacity: 0.5 }]}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.primaryDark]}
                  style={styles.modalSubmitGradient}
                >
                  {loading ? (
                    <View style={styles.uploadProgressRow}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.uploadProgressText}>{uploadStatus || 'Uploading...'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.modalSubmitText}>Upload Photo</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {mode === 'video' && (
            <View style={styles.modalBody}>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Video URL</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="https://youtube.com/watch?v=..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Caption</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Title or description..."
                  placeholderTextColor={Colors.dark.textMuted}
                  value={caption}
                  onChangeText={setCaption}
                />
              </View>
              {!!error && <Text style={styles.modalError}>{error}</Text>}
              <Pressable
                onPress={handleSaveVideo}
                disabled={loading || !videoUrl}
                style={[styles.modalSubmit, (loading || !videoUrl) && { opacity: 0.5 }]}
              >
                <LinearGradient
                  colors={[Colors.dark.primary, Colors.dark.primaryDark]}
                  style={styles.modalSubmitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Save Video Link</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function CreatePackageModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title || !price) return;
    setLoading(true);
    try {
      await apiRequest('POST', '/api/packages', { title, description, price });
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      setTitle(''); setDescription(''); setPrice('');
      onCreated();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Package</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Title</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., Full Day Coverage"
                placeholderTextColor={Colors.dark.textMuted}
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 80 }]}
                placeholder="What's included..."
                placeholderTextColor={Colors.dark.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Price ($)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0.00"
                placeholderTextColor={Colors.dark.textMuted}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Pressable
            onPress={handleCreate}
            disabled={loading || !title || !price}
            style={[styles.modalSubmit, (loading || !title || !price) && { opacity: 0.5 }]}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
              style={styles.modalSubmitGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitText}>Create Package</Text>
              )}
            </LinearGradient>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  profileAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  profileAvatarText: {
    fontSize: 36,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.background,
  },
  profileName: {
    fontSize: 24,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  roleBadgesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  creatorBadge: {
    backgroundColor: Colors.dark.accentMuted,
  },
  roleBadgeText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: Colors.dark.surface,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: spacing.xxl,
  },
  editProfileBtnText: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bioText: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  carCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: Colors.dark.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  carText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: Colors.dark.text,
  },
  carTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  carTagText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: Colors.dark.text,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: Colors.dark.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  tagText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
    textTransform: 'capitalize',
  },
  socialRow: {
    gap: spacing.md,
  },
  socialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  socialText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  emptySection: {
    backgroundColor: Colors.dark.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  portfolioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  portfolioItem: {
    width: '31.5%' as any,
  },
  portfolioCard: {
    height: 110,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  portfolioImage: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
  },
  portfolioVideoOverlay: {
    position: 'absolute' as const,
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 2,
  },
  portfolioCaption: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center' as const,
    marginTop: spacing.xs,
  },
  portfolioCaptionOverImage: {
    position: 'absolute' as const,
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginTop: 0,
  },
  portfolioDeleteBtn: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    zIndex: 2,
  },
  packageCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  packageInfo: {
    flex: 1,
    gap: 2,
  },
  packageTitle: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  packageDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  packagePrice: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: Colors.dark.primary,
    marginRight: spacing.sm,
  },
  packageDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  attendanceInfo: {
    flex: 1,
    gap: 2,
  },
  attendanceName: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  attendanceLocation: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  attendanceRole: {
    backgroundColor: Colors.dark.accentMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  attendanceRoleText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: Colors.dark.accent,
    textTransform: 'capitalize',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  editModalContainer: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
  },
  editModalScroll: {
    maxHeight: 500,
  },
  editModalBody: {
    padding: spacing.xl,
  },
  editSectionLabel: {
    fontSize: 14,
    fontFamily: fonts.headingBold,
    color: Colors.dark.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  modalBody: {
    padding: spacing.xl,
  },
  modalField: {
    marginBottom: spacing.lg,
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: Colors.dark.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg,
    height: 48,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
  },
  multilineInput: {
    height: 80,
    paddingTop: spacing.md,
    textAlignVertical: 'top' as const,
  },
  modalSubmit: {
    margin: spacing.xl,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  modalSubmitGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  modalSubmitText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.background,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: spacing.md,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: Colors.dark.text,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.surfaceHighlight,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.textMuted,
  },
  toggleThumbActive: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end' as const,
  },
  mediaTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mediaTypeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  mediaTypeChipSelected: {
    backgroundColor: Colors.dark.primaryMuted,
    borderColor: Colors.dark.primary,
  },
  mediaTypeChipText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  mediaTypeChipTextSelected: {
    color: Colors.dark.primary,
  },
  portfolioOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  portfolioOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  portfolioOptionInfo: {
    flex: 1,
  },
  portfolioOptionTitle: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  portfolioOptionDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  modalError: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.error,
    marginBottom: spacing.md,
  },
  imagePreviewContainer: {
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  imagePreview: {
    width: '100%' as any,
    height: 180,
    borderRadius: radius.md,
  },
  changePhotoBtn: {
    position: 'absolute' as const,
    bottom: 8,
    right: 8,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  changePhotoText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#fff',
  },
  uploadProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uploadProgressText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: '#fff',
  },
});

// ── Stripe Payout Setup Component ────────────────────────────────────────────

function StripePayoutSetup() {
  const [loading, setLoading] = useState(false);

  const { data: stripeStatus, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['/api/stripe/connect/status'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    staleTime: 60_000,
    retry: false,
    // Swallow errors — Stripe may not be configured yet
    throwOnError: false,
  });

  const handleSetupPayouts = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('POST', '/api/stripe/connect/onboard', {});
      if (data?.url) {
        await Linking.openURL(data.url);
        // Refresh status after returning from Stripe
        setTimeout(() => refetch(), 2000);
      } else {
        Alert.alert('Error', 'Could not start payout setup. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Payout Setup Error', err.message || 'Failed to start payout setup.');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return null;

  // Stripe not configured or query failed — hide the section silently
  if (isError || !stripeStatus) return null;

  const isReady = stripeStatus?.chargesEnabled && stripeStatus?.payoutsEnabled;
  const isInReview = stripeStatus?.detailsSubmitted && !isReady;
  const hasAccount = stripeStatus?.hasAccount;

  return (
    <View style={payoutStyles.section}>
      <View style={payoutStyles.header}>
        <Ionicons name="wallet-outline" size={18} color={Colors.dark.text} />
        <Text style={payoutStyles.title}>Payout Setup</Text>
        {isReady && (
          <View style={payoutStyles.badge}>
            <Ionicons name="checkmark-circle" size={13} color={Colors.dark.success} />
            <Text style={payoutStyles.badgeText}>Ready</Text>
          </View>
        )}
      </View>

      {isReady ? (
        <Text style={payoutStyles.desc}>
          Your payout account is active. You will receive payments directly after bookings are completed.
        </Text>
      ) : isInReview ? (
        <>
          <Text style={payoutStyles.desc}>
            Your payout account is under review by Stripe. You will be notified once approved.
          </Text>
          <Pressable onPress={handleSetupPayouts} style={payoutStyles.btn} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={Colors.dark.primary} /> : (
              <Text style={payoutStyles.btnText}>Resume Setup</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={payoutStyles.desc}>
            Set up your payout account to receive payments from drivers. Required before accepting paid bookings.
          </Text>
          <Pressable onPress={handleSetupPayouts} style={payoutStyles.btn} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={Colors.dark.primary} /> : (
              <>
                <Ionicons name="open-outline" size={15} color={Colors.dark.primary} />
                <Text style={payoutStyles.btnText}>{hasAccount ? 'Resume Setup' : 'Set Up Payouts'}</Text>
              </>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const payoutStyles = StyleSheet.create({
  section: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.successMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: Colors.dark.success,
  },
  desc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'flex-start' as const,
  },
  btnText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
});
