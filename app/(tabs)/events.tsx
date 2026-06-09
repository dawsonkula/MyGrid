import React, { useState } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, StyleSheet,
  ActivityIndicator, Platform, Modal, ScrollView, KeyboardAvoidingView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { fetch } from 'expo/fetch';
import { getQueryFn, apiRequest, queryClient, getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
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
      cloudFormData.append('file', blob, `banner_${Date.now()}.jpg`);
    } else {
      cloudFormData.append('file', {
        uri: compressedUri,
        name: `banner_${Date.now()}.jpg`,
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
    formData.append('file', blob, `banner_${Date.now()}.jpg`);
  } else {
    formData.append('file', {
      uri: compressedUri,
      name: `banner_${Date.now()}.jpg`,
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
      : 'Upload failed';
    throw new Error(msg);
  }

  const data = await uploadRes.json() as { url: string };
  return data.url;
}

const DEFAULT_EVENT_IMAGE_URL = '/uploads/event_placeholder.png';

function getBannerImageUrl(bannerImage: string): string {
  const img = bannerImage || DEFAULT_EVENT_IMAGE_URL;
  if (img.startsWith('http')) return img;
  return `${getApiUrl()}${img}`;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  'Competition': '#FF4D00',
  'Festival': '#7C3AED',
  'Drift Event': '#0EA5E9',
  'Track Day': '#10B981',
};

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: events = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['/api/events'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    select: (data) => data ?? [],
  });

  const filteredEvents = search
    ? events.filter((e: any) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.location.toLowerCase().includes(search.toLowerCase())
      )
    : events;

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + spacing.lg }]}>
        <Text style={styles.headerTitle}>Events</Text>
        <Pressable onPress={() => setShowCreateModal(true)} style={styles.createButton}>
          <Ionicons name="add" size={24} color={Colors.dark.primary} />
        </Pressable>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.dark.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search events..."
          placeholderTextColor={Colors.dark.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {!!search && (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.dark.textMuted} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="flag-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTitle}>No events found</Text>
              <Text style={styles.emptySubtitle}>Create an event or check back later</Text>
            </View>
          }
          renderItem={({ item }) => (
            <EventCard event={item} onPress={() => router.push(`/event/${item.id}`)} />
          )}
        />
      )}

      <CreateEventModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setShowCreateModal(false);
          refetch();
        }}
      />
    </View>
  );
}

function formatEventDate(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = start.toLocaleDateString(undefined, opts);
  const e = end.toLocaleDateString(undefined, opts);
  return s === e ? s : `${s} – ${e}`;
}

function EventCard({ event, onPress }: { event: any; onPress: () => void }) {
  const dateStart = new Date(event.dateStart);
  const dateEnd = new Date(event.dateEnd);
  const isUpcoming = dateStart >= new Date();
  const bannerUrl = getBannerImageUrl(event.bannerImage || '');
  const typeColor = EVENT_TYPE_COLORS[event.eventType] || Colors.dark.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.eventCard,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Banner */}
      <View>
        <Image
          source={{ uri: bannerUrl }}
          style={styles.eventBannerImage}
          resizeMode="cover"
        />
        {!isUpcoming && (
          <View style={styles.pastOverlay}>
            <Text style={styles.pastOverlayText}>Past</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.eventCardContent}>
        {/* 1 — Event name (dominant) */}
        <Text style={styles.eventCardName} numberOfLines={2}>{event.name}</Text>

        {/* 2 — Host */}
        {!!event.host && (
          <Text style={styles.eventCardHost} numberOfLines={1}>Hosted by {event.host}</Text>
        )}

        {/* 3 — Date */}
        <View style={styles.eventCardMetaRow}>
          <Ionicons name="calendar-outline" size={13} color={Colors.dark.textMuted} />
          <Text style={styles.eventCardMetaText}>{formatEventDate(dateStart, dateEnd)}</Text>
        </View>

        {/* 4 — Location */}
        {!!(event.venue || event.location) && (
          <View style={styles.eventCardMetaRow}>
            <Ionicons name="location-outline" size={13} color={Colors.dark.textMuted} />
            <Text style={styles.eventCardMetaText} numberOfLines={1}>
              {event.venue ? `${event.venue}, ${event.location}` : event.location}
            </Text>
          </View>
        )}

        {/* 5 — Pills row */}
        <View style={styles.eventCardPillsRow}>
          {!!event.eventType && (
            <View style={[styles.eventTypePill, { backgroundColor: typeColor + '22', borderColor: typeColor + '55' }]}>
              <Text style={[styles.eventTypePillText, { color: typeColor }]}>{event.eventType}</Text>
            </View>
          )}
          {!!event.isFeatured && (
            <View style={styles.featuredPill}>
              <Ionicons name="star" size={9} color="#F59E0B" />
              <Text style={styles.featuredPillText}>Featured</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const EVENT_TYPES = ['Drift Event', 'Competition', 'Track Day', 'Festival'];

function CreateEventModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [location, setLocation] = useState('');
  const [venue, setVenue] = useState('');
  const [eventType, setEventType] = useState('Drift Event');
  const [description, setDescription] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [bannerPreview, setBannerPreview] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);

  const pickBannerImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access media library is required');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const pickedUri = result.assets[0].uri;
      setBannerPreview(pickedUri);
      setUploading(true);
      setUploadStatus('Compressing...');
      setError('');

      const compressed = await compressImage(pickedUri);
      const url = await uploadPhotoToCloud(compressed, setUploadStatus);
      setBannerImage(url);
      setUploadStatus('');
      setUploading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to upload banner image');
      setUploadStatus('');
      setUploading(false);
    }
  };

  const removeBanner = () => {
    setBannerImage('');
    setBannerPreview('');
    setUploadStatus('');
  };

  const handleCreate = async () => {
    if (!name || !location || !dateStart || !dateEnd) {
      setError('Name, location, and dates are required');
      return;
    }
    if (uploading) {
      setError('Please wait for the banner image to finish uploading');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiRequest('POST', '/api/events', {
        name, host, location, venue, eventType, description, dateStart, dateEnd,
        bannerImage: bannerImage || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
      setName(''); setHost(''); setLocation(''); setVenue('');
      setEventType('Drift Event'); setDescription('');
      setDateStart(''); setDateEnd('');
      setBannerImage(''); setBannerPreview(''); setUploadStatus('');
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create event');
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
            <Text style={styles.modalTitle}>Create Event</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Banner Image (optional)</Text>
              {bannerPreview ? (
                <View style={styles.bannerPreviewContainer}>
                  <Image
                    source={{ uri: bannerPreview }}
                    style={styles.bannerPreviewImage}
                    resizeMode="cover"
                  />
                  <View style={styles.bannerOverlay}>
                    <Pressable
                      onPress={pickBannerImage}
                      style={styles.bannerChangeButton}
                      disabled={uploading}
                    >
                      <Ionicons name="camera-outline" size={16} color="#fff" />
                      <Text style={styles.bannerChangeText}>Change</Text>
                    </Pressable>
                    <Pressable
                      onPress={removeBanner}
                      style={styles.bannerRemoveButton}
                      disabled={uploading}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.dark.error} />
                    </Pressable>
                  </View>
                  {uploading && (
                    <View style={styles.bannerUploadingOverlay}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.bannerUploadingText}>{uploadStatus}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <Pressable onPress={pickBannerImage} style={styles.bannerPickerArea}>
                  <Ionicons name="camera-outline" size={28} color={Colors.dark.textMuted} />
                  <Text style={styles.bannerPickerText}>Tap to add banner image</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Event Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., ClubLoose – Final Bout – Englishtown"
                placeholderTextColor={Colors.dark.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Host / Organizer (optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., ClubLoose"
                placeholderTextColor={Colors.dark.textMuted}
                value={host}
                onChangeText={setHost}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Event Type</Text>
              <View style={styles.eventTypeRow}>
                {EVENT_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setEventType(t)}
                    style={[
                      styles.eventTypeChip,
                      eventType === t && styles.eventTypeChipActive,
                    ]}
                  >
                    <Text style={[
                      styles.eventTypeChipText,
                      eventType === t && styles.eventTypeChipTextActive,
                    ]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Location</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., Austin, TX"
                placeholderTextColor={Colors.dark.textMuted}
                value={location}
                onChangeText={setLocation}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Venue (optional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g., Circuit of the Americas"
                placeholderTextColor={Colors.dark.textMuted}
                value={venue}
                onChangeText={setVenue}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 80 }]}
                placeholder="Event details..."
                placeholderTextColor={Colors.dark.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.dateRow}>
              <View style={[styles.modalField, { flex: 1 }]}>
                <Text style={styles.modalLabel}>Start Date</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={dateStart}
                  onChangeText={setDateStart}
                />
              </View>
              <View style={[styles.modalField, { flex: 1 }]}>
                <Text style={styles.modalLabel}>End Date</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={dateEnd}
                  onChangeText={setDateEnd}
                />
              </View>
            </View>

            {!!error && (
              <Text style={styles.modalError}>{error}</Text>
            )}
          </ScrollView>

          <Pressable
            onPress={handleCreate}
            disabled={loading}
            style={[styles.modalSubmit, loading && { opacity: 0.7 }]}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
              style={styles.modalSubmitGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitText}>Create Event</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  eventCard: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  eventBannerImage: {
    width: '100%',
    height: 140,
  },
  pastOverlay: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pastOverlayText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
    letterSpacing: 0.5,
  },
  eventCardContent: {
    padding: spacing.lg,
    gap: 5,
  },
  eventCardName: {
    fontSize: 17,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    lineHeight: 23,
    marginBottom: 2,
  },
  eventCardHost: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    fontStyle: 'italic',
  },
  eventCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eventCardMetaText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  eventCardPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  eventTypePill: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  eventTypePillText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.3,
  },
  featuredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#F59E0B55',
    backgroundColor: '#F59E0B18',
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  featuredPillText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: '#F59E0B',
    letterSpacing: 0.3,
  },
  eventCardDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
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
    maxHeight: '90%',
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
  eventTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  eventTypeChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  eventTypeChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primaryMuted,
  },
  eventTypeChipText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  eventTypeChipTextActive: {
    color: Colors.dark.primary,
    fontFamily: fonts.semiBold,
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
  dateRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalError: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.error,
    marginBottom: spacing.md,
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
  bannerPickerArea: {
    height: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.dark.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  bannerPickerText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  bannerPreviewContainer: {
    height: 160,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerPreviewImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bannerChangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  bannerChangeText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  bannerRemoveButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  bannerUploadingText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
});
