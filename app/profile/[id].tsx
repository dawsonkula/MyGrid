import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform,
  Image, Linking,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQueryFn, getApiUrl, queryClient } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

const PORTFOLIO_COLORS = [
  '#1E3A5F', '#2D1B4E', '#1B4332', '#4A1942', '#3D2B1F',
  '#1A3C40', '#2C1654', '#3B1F2B', '#1F3D0C', '#2B2D42',
];

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProfileViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'driver' | 'creator'>('driver');

  const { data: profileUser, isLoading } = useQuery<any>({
    queryKey: ['/api/users', id],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const { data: portfolio = [] } = useQuery<any[]>({
    queryKey: ['/api/portfolio', id],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!id,
    select: (data) => data ?? [],
  });

  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ['/api/packages', id],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!id,
    select: (data) => data ?? [],
  });

  const { data: upcomingEvents = [] } = useQuery<any[]>({
    queryKey: ['/api/users', id, 'events'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    select: (data) => data ?? [],
  });

  useFocusEffect(
    useCallback(() => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['/api/users', id] });
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio', id] });
        queryClient.invalidateQueries({ queryKey: ['/api/packages', id] });
        queryClient.invalidateQueries({ queryKey: ['/api/users', id, 'events'] });
      }
    }, [id])
  );

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!profileUser) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  const socialLinks = (() => {
    try { return JSON.parse(profileUser.socialLinks || '{}'); } catch { return {}; }
  })();

  const isDriverEnabled = profileUser.isDriverEnabled === true;
  const isCreatorEnabled = profileUser.isCreatorEnabled === true;
  const hasBothRoles = isDriverEnabled && isCreatorEnabled;
  const hasNoExplicitRoles = profileUser.isDriverEnabled === null && profileUser.isCreatorEnabled === null;

  const showAsCreator = hasNoExplicitRoles
    ? profileUser.primaryRole === 'creator'
    : isCreatorEnabled;
  const showAsDriver = hasNoExplicitRoles
    ? profileUser.primaryRole === 'driver'
    : isDriverEnabled;

  const canBook = isCreatorEnabled || (profileUser.isCreatorEnabled === null && profileUser.primaryRole === 'creator');
  const isOwnProfile = currentUser?.id === id;

  const profileImageUrl = profileUser.profileImage
    ? (profileUser.profileImage.startsWith('http')
      ? profileUser.profileImage
      : `${getApiUrl()}${profileUser.profileImage}`)
    : null;

  // ── Stats row data ─────────────────────────────────────────────────────────
  const statsItems = [
    ...(portfolio.length > 0 ? [{ value: portfolio.length, label: 'Portfolio' }] : []),
    ...(upcomingEvents.length > 0 ? [{ value: upcomingEvents.length, label: 'Upcoming' }] : []),
    ...(packages.length > 0 ? [{ value: packages.length, label: 'Packages' }] : []),
  ];

  // ── Role badges ────────────────────────────────────────────────────────────
  const renderRoleBadges = () => {
    if (hasNoExplicitRoles) {
      return (
        <View style={styles.roleBadge}>
          <Ionicons
            name={profileUser.primaryRole === 'creator' ? 'camera' : 'car-sport'}
            size={13}
            color={Colors.dark.primary}
          />
          <Text style={styles.roleBadgeText}>
            {profileUser.primaryRole === 'creator' ? 'Media Creator' : 'Driver'}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.badgeRow}>
        {isDriverEnabled && (
          <View style={styles.roleBadge}>
            <Ionicons name="car-sport" size={13} color={Colors.dark.primary} />
            <Text style={styles.roleBadgeText}>Driver</Text>
          </View>
        )}
        {isCreatorEnabled && (
          <View style={styles.roleBadge}>
            <Ionicons name="camera" size={13} color={Colors.dark.primary} />
            <Text style={styles.roleBadgeText}>Media Creator</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Upcoming event mini-cards ──────────────────────────────────────────────
  const renderUpcomingEvents = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Upcoming Events</Text>
      {upcomingEvents.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={24} color={Colors.dark.textMuted} />
          <Text style={styles.emptyStateText}>No upcoming events listed yet.</Text>
        </View>
      ) : (
        <View style={styles.upcomingEventsCol}>
          {upcomingEvents.map((event: any) => {
            const bannerUri = event.bannerImage?.startsWith('http')
              ? event.bannerImage
              : `${getApiUrl()}${event.bannerImage}`;
            return (
              <Pressable
                key={event.id}
                style={({ pressed }) => [styles.upcomingEventCard, pressed && { opacity: 0.8 }]}
                onPress={() => router.push(`/event/${event.id}`)}
              >
                <Image source={{ uri: bannerUri }} style={styles.upcomingEventBanner} resizeMode="cover" />
                <View style={styles.upcomingEventInfo}>
                  <Text style={styles.upcomingEventName} numberOfLines={2}>{event.name}</Text>
                  {event.dateStart && (
                    <View style={styles.upcomingEventMeta}>
                      <Ionicons name="calendar-outline" size={12} color={Colors.dark.textMuted} />
                      <Text style={styles.upcomingEventMetaText}>{formatShortDate(event.dateStart)}</Text>
                    </View>
                  )}
                  {event.location && (
                    <View style={styles.upcomingEventMeta}>
                      <Ionicons name="location-outline" size={12} color={Colors.dark.textMuted} />
                      <Text style={styles.upcomingEventMetaText} numberOfLines={1}>{event.location}</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.dark.textMuted} style={{ alignSelf: 'center' }} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  // ── Creator content ────────────────────────────────────────────────────────
  const renderCreatorContent = () => (
    <>
      {(profileUser.creatorBio || profileUser.bio) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bioText}>{profileUser.creatorBio || profileUser.bio}</Text>
        </View>
      ) : null}

      {profileUser.mediaTypes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specialties</Text>
          <View style={styles.tagRow}>
            {profileUser.mediaTypes.split(',').map((t: string) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t.replace('_', ' ')}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {renderUpcomingEvents()}

      {/* Packages */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Packages</Text>
        {packages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={24} color={Colors.dark.textMuted} />
            <Text style={styles.emptyStateText}>No packages added yet.</Text>
            {isOwnProfile && (
              <Text style={styles.emptyStateHint}>Add packages from your profile settings.</Text>
            )}
          </View>
        ) : (
          packages.map((pkg: any) => (
            <View key={pkg.id} style={styles.packageCard}>
              {pkg.isPopular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>Popular</Text>
                </View>
              )}
              <View style={styles.packageTop}>
                <View style={styles.packageInfo}>
                  <Text style={styles.packageTitle}>{pkg.title}</Text>
                  {pkg.description ? (
                    <Text style={styles.packageDesc}>{pkg.description}</Text>
                  ) : null}
                  {pkg.deliveryTime ? (
                    <View style={styles.deliveryTimeRow}>
                      <Ionicons name="time-outline" size={13} color={Colors.dark.textMuted} />
                      <Text style={styles.deliveryTimeText}>{pkg.deliveryTime}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.packagePrice}>${pkg.price}</Text>
              </View>
              {!isOwnProfile && canBook && (
                <Pressable
                  style={({ pressed }) => [styles.bookingBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => router.push({
                    pathname: '/booking/create',
                    params: { creatorId: id, packageId: pkg.id },
                  })}
                >
                  <Ionicons name="calendar-outline" size={15} color={Colors.dark.primary} />
                  <Text style={styles.bookingBtnText}>Request Booking</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>

      {/* Portfolio */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Portfolio</Text>
        {portfolio.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="camera-outline" size={24} color={Colors.dark.textMuted} />
            <Text style={styles.emptyStateText}>No portfolio added yet.</Text>
            {isOwnProfile && (
              <Text style={styles.emptyStateHint}>Share your work from your profile settings.</Text>
            )}
          </View>
        ) : (
          <View style={styles.portfolioGrid}>
            {portfolio.map((item: any, index: number) => {
              const hasRealImage = item.mediaType === 'photo' && item.mediaUrl && item.mediaUrl !== 'photo_placeholder';
              const imageUrl = hasRealImage
                ? (item.mediaUrl.startsWith('http') ? item.mediaUrl : `${getApiUrl()}${item.mediaUrl}`)
                : null;
              const isVideo = item.mediaType === 'external_video';
              return (
                <Pressable
                  key={item.id}
                  style={styles.portfolioItem}
                  onPress={() => {
                    if (isVideo && item.externalUrl) Linking.openURL(item.externalUrl);
                  }}
                >
                  <View style={[styles.portfolioCard, !imageUrl && { backgroundColor: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }]}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.portfolioImage} />
                    ) : (
                      <Ionicons
                        name={isVideo ? 'play-circle' : 'camera'}
                        size={28}
                        color="rgba(255,255,255,0.6)"
                      />
                    )}
                    {isVideo && (
                      <View style={styles.portfolioVideoOverlay}>
                        <Ionicons name="play-circle" size={18} color="#fff" />
                      </View>
                    )}
                    {item.caption ? (
                      <Text style={[styles.portfolioCaption, imageUrl && styles.portfolioCaptionOverImage]} numberOfLines={2}>{item.caption}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </>
  );

  // ── Driver content ─────────────────────────────────────────────────────────
  const renderDriverContent = () => (
    <>
      {(profileUser.driverBio || profileUser.bio) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bioText}>{profileUser.driverBio || profileUser.bio}</Text>
        </View>
      ) : null}

      {(profileUser.cars || profileUser.carInfo) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Car</Text>
          <View style={styles.carCard}>
            <Ionicons name="car-sport" size={20} color={Colors.dark.primary} />
            <Text style={styles.carText}>{profileUser.cars || profileUser.carInfo}</Text>
          </View>
        </View>
      ) : null}

      {renderUpcomingEvents()}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerText}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <View style={styles.profileCard}>
          {profileImageUrl ? (
            <View style={styles.avatarImageContainer}>
              <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} />
            </View>
          ) : (
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {(profileUser.displayName || 'U')[0].toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          <Text style={styles.name}>{profileUser.displayName}</Text>
          {renderRoleBadges()}
          {profileUser.location ? (
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.locText}>{profileUser.location}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        {!isOwnProfile ? (
          <View style={styles.actionButtons}>
            <Pressable
              onPress={() => router.push(`/chat/${id}`)}
              style={styles.actionBtn}
            >
              <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.text} />
              <Text style={styles.actionBtnText}>Message</Text>
            </Pressable>
            {canBook && (
              <Pressable
                onPress={() => router.push({
                  pathname: '/booking/create',
                  params: { creatorId: id },
                })}
                style={[styles.actionBtn, styles.bookActionBtn]}
              >
                <Ionicons name="calendar-outline" size={18} color={Colors.dark.primary} />
                <Text style={[styles.actionBtnText, { color: Colors.dark.primary }]}>Book Creator</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <Pressable
              onPress={() => router.push('/profile')}
              style={[styles.actionBtn, { flex: 1 }]}
            >
              <Ionicons name="create-outline" size={18} color={Colors.dark.text} />
              <Text style={styles.actionBtnText}>Edit Profile</Text>
            </Pressable>
          </View>
        )}

        {/* Stats row — only if creator with any data */}
        {showAsCreator && statsItems.length > 0 && (
          <View style={styles.statsRow}>
            {statsItems.map((item, i) => (
              <React.Fragment key={item.label}>
                <View style={styles.statBlock}>
                  <Text style={styles.statValue}>{item.value}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
                {i < statsItems.length - 1 && <View style={styles.statDivider} />}
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Role tab bar + content */}
        {hasBothRoles ? (
          <>
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tab, activeTab === 'driver' && styles.tabActive]}
                onPress={() => setActiveTab('driver')}
              >
                <Text style={[styles.tabText, activeTab === 'driver' && styles.tabTextActive]}>Driver</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === 'creator' && styles.tabActive]}
                onPress={() => setActiveTab('creator')}
              >
                <Text style={[styles.tabText, activeTab === 'creator' && styles.tabTextActive]}>Creator</Text>
              </Pressable>
            </View>
            {activeTab === 'driver' ? renderDriverContent() : renderCreatorContent()}
          </>
        ) : showAsCreator ? (
          <>
            {profileUser.bio && !profileUser.creatorBio ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.bioText}>{profileUser.bio}</Text>
              </View>
            ) : null}
            {renderCreatorContent()}
          </>
        ) : showAsDriver ? (
          renderDriverContent()
        ) : (
          profileUser.bio ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.bioText}>{profileUser.bio}</Text>
            </View>
          ) : null
        )}

        {/* Social links */}
        {(socialLinks.instagram || socialLinks.youtube || socialLinks.tiktok) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Social</Text>
            <View style={styles.socialCol}>
              {socialLinks.instagram ? (
                <Pressable style={styles.socialItem} onPress={() => Linking.openURL(`https://instagram.com/${socialLinks.instagram}`)}>
                  <Ionicons name="logo-instagram" size={20} color="#E1306C" />
                  <Text style={styles.socialText}>@{socialLinks.instagram}</Text>
                </Pressable>
              ) : null}
              {socialLinks.youtube ? (
                <Pressable style={styles.socialItem} onPress={() => socialLinks.youtube.startsWith('http') && Linking.openURL(socialLinks.youtube)}>
                  <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                  <Text style={styles.socialText}>{socialLinks.youtube}</Text>
                </Pressable>
              ) : null}
              {socialLinks.tiktok ? (
                <Pressable style={styles.socialItem} onPress={() => Linking.openURL(`https://tiktok.com/@${socialLinks.tiktok}`)}>
                  <Ionicons name="logo-tiktok" size={20} color={Colors.dark.text} />
                  <Text style={styles.socialText}>@{socialLinks.tiktok}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={{ height: Math.max(insets.bottom, webBottomInset) + 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerText: { fontSize: 16, fontFamily: fonts.semiBold, color: Colors.dark.text },
  scrollContent: { paddingHorizontal: spacing.xl },
  errorText: { fontSize: 16, fontFamily: fonts.regular, color: Colors.dark.textMuted, textAlign: 'center', marginTop: 60 },

  // Hero card
  profileCard: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  avatar: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  avatarText: { fontSize: 36, fontFamily: fonts.bold, color: '#fff' },
  avatarImageContainer: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', marginBottom: spacing.xs },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  name: { fontSize: 22, fontFamily: fonts.headingBold, color: Colors.dark.text, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.dark.primaryMuted, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full,
  },
  roleBadgeText: { fontSize: 12, fontFamily: fonts.semiBold, color: Colors.dark.primary },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locText: { fontSize: 13, fontFamily: fonts.regular, color: Colors.dark.textMuted },

  // Action buttons
  actionButtons: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: Colors.dark.surface, borderRadius: radius.md, height: 46,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  bookActionBtn: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primaryMuted },
  actionBtnText: { fontSize: 14, fontFamily: fonts.semiBold, color: Colors.dark.text },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 24, fontFamily: fonts.condensedBold, color: Colors.dark.text, lineHeight: 26 },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, color: Colors.dark.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: Colors.dark.border, marginVertical: 4 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', marginBottom: spacing.xl,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.dark.primary },
  tabText: { fontSize: 15, fontFamily: fonts.semiBold, color: Colors.dark.textMuted },
  tabTextActive: { color: Colors.dark.primary },

  // Sections
  section: { marginBottom: spacing.xxl },
  sectionTitle: {
    fontSize: 12, fontFamily: fonts.headingBold, color: Colors.dark.textMuted,
    marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 1.2,
  },
  bioText: { fontSize: 15, fontFamily: fonts.regular, color: Colors.dark.textSecondary, lineHeight: 23 },

  // Car card
  carCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: Colors.dark.surface, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  carText: { fontSize: 15, fontFamily: fonts.medium, color: Colors.dark.text },

  // Tag row
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: {
    backgroundColor: Colors.dark.primaryMuted, paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs, borderRadius: radius.full,
  },
  tagText: { fontSize: 12, fontFamily: fonts.semiBold, color: Colors.dark.primary, textTransform: 'capitalize' },

  // Upcoming events
  upcomingEventsCol: { gap: spacing.sm },
  upcomingEventCard: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  upcomingEventBanner: { width: 70, height: 70 },
  upcomingEventInfo: { flex: 1, paddingHorizontal: spacing.md, gap: 4 },
  upcomingEventName: { fontSize: 13, fontFamily: fonts.semiBold, color: Colors.dark.text, lineHeight: 18 },
  upcomingEventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upcomingEventMetaText: { fontSize: 11, fontFamily: fonts.regular, color: Colors.dark.textMuted, flex: 1 },

  // Packages
  packageCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  packageTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: spacing.lg,
  },
  packageInfo: { flex: 1, gap: 4, paddingRight: spacing.md },
  packageTitle: { fontSize: 15, fontFamily: fonts.semiBold, color: Colors.dark.text },
  packageDesc: { fontSize: 13, fontFamily: fonts.regular, color: Colors.dark.textMuted, lineHeight: 18 },
  packagePrice: { fontSize: 28, fontFamily: fonts.condensedBold, color: Colors.dark.primary, lineHeight: 30 },
  bookingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
    paddingVertical: spacing.md,
    backgroundColor: Colors.dark.primaryMuted,
  },
  bookingBtnText: { fontSize: 14, fontFamily: fonts.semiBold, color: Colors.dark.primary },
  popularBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    alignSelf: 'flex-start' as const,
    margin: spacing.sm,
    marginBottom: 0,
    borderRadius: radius.sm,
  },
  popularBadgeText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: Colors.dark.background,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  deliveryTimeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: 2,
  },
  deliveryTimeText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },

  // Portfolio
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  portfolioItem: { width: '31.5%' as any },
  portfolioCard: {
    aspectRatio: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    padding: spacing.sm, position: 'relative' as const, overflow: 'hidden' as const,
  },
  portfolioImage: { ...StyleSheet.absoluteFillObject, borderRadius: radius.md },
  portfolioVideoOverlay: {
    position: 'absolute' as const, bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 2,
  },
  portfolioCaption: {
    fontSize: 11, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center' as const, marginTop: spacing.xs,
  },
  portfolioCaptionOverImage: {
    position: 'absolute' as const, bottom: 4, left: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, marginTop: 0,
  },

  // Empty states
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: spacing.sm,
  },
  emptyStateText: { fontSize: 14, fontFamily: fonts.medium, color: Colors.dark.textSecondary },
  emptyStateHint: { fontSize: 12, fontFamily: fonts.regular, color: Colors.dark.textMuted, textAlign: 'center' as const },

  // Social
  socialCol: { gap: spacing.md },
  socialItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  socialText: { fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.textSecondary },
});
                                                    