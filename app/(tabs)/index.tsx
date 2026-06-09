import React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Platform, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { getQueryFn } from '@/lib/query-client';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset } from '@/constants/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;
  const isCreator = user?.primaryRole === 'creator';

  const { data: myAttendance = [], isLoading: loadingAttendance } = useQuery<any[]>({
    queryKey: ['/api/attendance'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    select: (data) => data ?? [],
  });

  const { data: myBookings = [], isLoading: loadingBookings } = useQuery<any[]>({
    queryKey: ['/api/bookings'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    select: (data) => data ?? [],
  });

  const { data: allEvents = [], isLoading: loadingEvents } = useQuery<any[]>({
    queryKey: ['/api/events'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    select: (data) => data ?? [],
  });

  const upcomingEvents = myAttendance.filter((a: any) => {
    if (!a.event) return false;
    return new Date(a.event.dateStart) >= new Date();
  }).slice(0, 10);

  const discoverEvents = allEvents
    .filter((e: any) => new Date(e.dateStart) >= new Date())
    .sort((a: any, b: any) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime())
    .slice(0, 10);

  const activeBookings = myBookings.filter(
    (b: any) => ['requested', 'accepted', 'in_progress'].includes(b.status)
  ).slice(0, 3);

  const completedCount = myBookings.filter((b: any) => b.status === 'completed').length;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPadding + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>{greeting}</Text>
            <Text style={styles.greetingName}>{user?.displayName || 'Racer'}</Text>
            <View style={styles.rolePill}>
              <Ionicons
                name={isCreator ? 'camera' : 'flag'}
                size={11}
                color={isCreator ? Colors.dark.accent : Colors.dark.primary}
              />
              <Text style={[styles.rolePillText, isCreator && { color: Colors.dark.accent }]}>
                {isCreator ? 'Creator' : 'Driver'}
              </Text>
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatarWrap}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {(user?.displayName || 'U')[0].toUpperCase()}
              </Text>
            </LinearGradient>
            <View style={styles.avatarOnline} />
          </Pressable>
        </View>

        {/* ── Stats Bar ── */}
        <View style={styles.statsRow}>
          <StatCard
            value={myAttendance.length}
            label="Events"
            icon="flag"
            color={Colors.dark.primary}
          />
          <View style={styles.statDivider} />
          <StatCard
            value={myBookings.length}
            label="Bookings"
            icon="calendar"
            color={Colors.dark.accent}
          />
          <View style={styles.statDivider} />
          <StatCard
            value={completedCount}
            label="Completed"
            icon="checkmark-circle"
            color={Colors.dark.warning}
          />
        </View>

        {/* ── Active Bookings ── */}
        {activeBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.activeDot} />
                <Text style={styles.sectionTitle}>Active Bookings</Text>
              </View>
              <Pressable onPress={() => router.push('/(tabs)/bookings')}>
                <Text style={styles.seeAll}>See all →</Text>
              </Pressable>
            </View>
            {activeBookings.map((booking: any) => (
              <ActiveBookingCard
                key={booking.id}
                booking={booking}
                userId={user?.id}
                onPress={() => router.push('/(tabs)/bookings')}
              />
            ))}
          </View>
        )}

        {/* ── Your Upcoming Events ── */}
        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Events</Text>
              <Pressable onPress={() => router.push('/(tabs)/events')}>
                <Text style={styles.seeAll}>See all →</Text>
              </Pressable>
            </View>
            <FlatList
              data={upcomingEvents}
              keyExtractor={(item) => item.id.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.xl }}
              renderItem={({ item: att }) => (
                <EventCard
                  event={att.event}
                  role={att.role}
                  onPress={() => router.push(`/event/${att.event.id}`)}
                />
              )}
            />
          </View>
        )}

        {/* ── Discover Events ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {upcomingEvents.length === 0 ? 'Find Your Next Event' : 'Discover Events'}
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/events')}>
              <Text style={styles.seeAll}>See all →</Text>
            </Pressable>
          </View>

          {loadingEvents ? (
            <ActivityIndicator color={Colors.dark.primary} style={{ marginVertical: 24 }} />
          ) : discoverEvents.length === 0 ? (
            <DiscoverEmpty onPress={() => router.push('/(tabs)/events')} />
          ) : (
            discoverEvents.map((event: any) => (
              <DiscoverEventRow
                key={event.id}
                event={event}
                onPress={() => router.push(`/event/${event.id}`)}
              />
            ))
          )}
        </View>

        {/* ── CTA Banner ── */}
        <Pressable
          onPress={() => router.push('/(tabs)/events')}
          style={({ pressed }) => [styles.ctaBanner, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={['rgba(176,130,255,0.18)', 'rgba(94,236,192,0.10)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            <View style={styles.ctaContent}>
              <Ionicons name="camera-outline" size={28} color={Colors.dark.accent} />
              <View style={styles.ctaText}>
                <Text style={styles.ctaTitle}>
                  {isCreator ? 'Find events near you' : 'Book your media today'}
                </Text>
                <Text style={styles.ctaSubtitle}>
                  {isCreator
                    ? 'Connect with drivers at your next race'
                    : 'Professional creators at every event'}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={Colors.dark.primary} />
            </View>
          </LinearGradient>
        </Pressable>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ value, label, icon, color }: {
  value: number; label: string; icon: string; color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EventCard({ event, role, onPress }: {
  event: any; role?: string; onPress: () => void;
}) {
  const date = new Date(event.dateStart);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.8 }]}
    >
      <LinearGradient
        colors={['rgba(176,130,255,0.12)', 'rgba(94,236,192,0.06)']}
        style={styles.eventCardGradient}
      >
        <View style={styles.eventCardDate}>
          <Text style={styles.eventCardMonth}>
            {date.toLocaleString('default', { month: 'short' }).toUpperCase()}
          </Text>
          <Text style={styles.eventCardDay}>{date.getDate()}</Text>
        </View>
        <Text style={styles.eventCardName} numberOfLines={2}>{event.name}</Text>
        <View style={styles.eventCardMeta}>
          <Ionicons name="location-outline" size={11} color={Colors.dark.textMuted} />
          <Text style={styles.eventCardLocation} numberOfLines={1}>{event.location}</Text>
        </View>
        {role && (
          <View style={[
            styles.eventCardRole,
            role === 'creator' && { backgroundColor: Colors.dark.accentMuted },
          ]}>
            <Text style={[
              styles.eventCardRoleText,
              role === 'creator' && { color: Colors.dark.accent },
            ]}>
              {role}
            </Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

function DiscoverEventRow({ event, onPress }: { event: any; onPress: () => void }) {
  const date = new Date(event.dateStart);
  const daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.discoverRow, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.discoverDateBadge}>
        <Text style={styles.discoverDateMonth}>
          {date.toLocaleString('default', { month: 'short' }).toUpperCase()}
        </Text>
        <Text style={styles.discoverDateDay}>{date.getDate()}</Text>
      </View>
      <View style={styles.discoverInfo}>
        <Text style={styles.discoverName} numberOfLines={1}>{event.name}</Text>
        <View style={styles.discoverMeta}>
          <Ionicons name="location-outline" size={12} color={Colors.dark.textMuted} />
          <Text style={styles.discoverLocation} numberOfLines={1}>{event.location}</Text>
        </View>
      </View>
      <View style={styles.discoverRight}>
        {daysUntil <= 7 ? (
          <View style={styles.soonBadge}>
            <Text style={styles.soonBadgeText}>Soon</Text>
          </View>
        ) : (
          <Text style={styles.daysUntil}>{daysUntil}d</Text>
        )}
        <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
      </View>
    </Pressable>
  );
}

function ActiveBookingCard({ booking, userId, onPress }: {
  booking: any; userId?: string; onPress: () => void;
}) {
  const other = userId === booking.driverId ? booking.creator : booking.driver;
  const statusColor = {
    requested: Colors.dark.warning,
    accepted: Colors.dark.accent,
    in_progress: Colors.dark.primary,
  }[booking.status as string] || Colors.dark.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bookingRow, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.bookingAvatar, { borderColor: statusColor }]}>
        <Text style={styles.bookingAvatarText}>
          {(other?.displayName || '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.bookingInfo}>
        <Text style={styles.bookingName} numberOfLines={1}>
          {other?.displayName || 'Unknown'}
        </Text>
        <Text style={styles.bookingEvent} numberOfLines={1}>
          {booking.event?.name || 'No event'}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {booking.status.replace('_', ' ')}
        </Text>
      </View>
    </Pressable>
  );
}

function DiscoverEmpty({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.emptyCard, pressed && { opacity: 0.8 }]}>
      <Ionicons name="flag-outline" size={28} color={Colors.dark.textMuted} />
      <Text style={styles.emptyText}>No upcoming events yet</Text>
      <Text style={styles.emptySubtext}>Check back soon or browse all events</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  scroll: { paddingHorizontal: spacing.xl },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xxl,
  },
  headerLeft: { gap: 4 },
  greetingText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  greetingName: {
    fontSize: 26,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.dark.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    marginTop: 4,
  },
  rolePillText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  avatarOnline: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.dark.accent,
    borderWidth: 2,
    borderColor: Colors.dark.background,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 28,
    fontFamily: fonts.condensedBold,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: 4,
  },

  // Section
  section: { marginBottom: spacing.xxl },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },

  // Horizontal event card
  eventCard: {
    width: 160,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  eventCardGradient: {
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: 140,
  },
  eventCardDate: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.dark.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignItems: 'center',
  },
  eventCardMonth: {
    fontSize: 9,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  eventCardDay: {
    fontSize: 20,
    fontFamily: fonts.condensedBold,
    color: Colors.dark.primary,
    lineHeight: 22,
  },
  eventCardName: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
    lineHeight: 18,
    flex: 1,
  },
  eventCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  eventCardLocation: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  eventCardRole: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.dark.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  eventCardRoleText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
    textTransform: 'capitalize',
  },

  // Discover rows
  discoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  discoverDateBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverDateMonth: {
    fontSize: 9,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  discoverDateDay: {
    fontSize: 18,
    fontFamily: fonts.condensedBold,
    color: Colors.dark.primary,
    lineHeight: 20,
  },
  discoverInfo: { flex: 1, gap: 2 },
  discoverName: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  discoverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  discoverLocation: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  discoverRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  soonBadge: {
    backgroundColor: Colors.dark.warningMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  soonBadgeText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: Colors.dark.warning,
  },
  daysUntil: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: Colors.dark.textMuted,
  },

  // Active booking card
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  bookingAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  bookingAvatarText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: Colors.dark.text,
  },
  bookingInfo: { flex: 1, gap: 2 },
  bookingName: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  bookingEvent: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    textTransform: 'capitalize',
  },

  // CTA Banner
  ctaBanner: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: spacing.md,
  },
  ctaGradient: { padding: spacing.lg },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ctaText: { flex: 1, gap: 2 },
  ctaTitle: {
    fontSize: 15,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  ctaSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },

  // Empty
  emptyCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
  },
  emptySubtext: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textAlign: 'center',
  },
});
