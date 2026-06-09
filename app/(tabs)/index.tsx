import React from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform,
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

  const upcomingEvents = (myAttendance || []).filter((a: any) => {
    if (!a.event) return false;
    return new Date(a.event.dateStart) >= new Date();
  }).slice(0, 5);

  const pendingBookings = (myBookings || []).filter(
    (b: any) => b.status === 'requested'
  ).slice(0, 5);

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPadding + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greeting}>
          <View>
            <Text style={styles.greetingLabel}>Welcome back</Text>
            <Text style={styles.greetingName}>{user?.displayName || 'Racer'}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.avatarButton}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {(user?.displayName || 'U')[0].toUpperCase()}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          <QuickAction
            icon="flag-outline"
            label="Browse Events"
            onPress={() => router.push('/(tabs)/events')}
          />
          <QuickAction
            icon="add-circle-outline"
            label="Create Event"
            onPress={() => router.push('/(tabs)/events')}
            accent
          />
          <QuickAction
            icon="chatbubble-outline"
            label="Messages"
            onPress={() => router.push('/(tabs)/messages')}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            <Pressable onPress={() => router.push('/(tabs)/events')}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          {loadingAttendance ? (
            <ActivityIndicator color={Colors.dark.primary} style={{ marginVertical: 20 }} />
          ) : upcomingEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="flag-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No upcoming events</Text>
              <Text style={styles.emptySubtext}>Browse events to find your next track day</Text>
            </View>
          ) : (
            upcomingEvents.map((att: any) => (
              <Pressable
                key={att.id}
                onPress={() => router.push(`/event/${att.event.id}`)}
                style={({ pressed }) => [
                  styles.eventCard,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.eventDateBadge}>
                  <Text style={styles.eventDateMonth}>
                    {new Date(att.event.dateStart).toLocaleString('default', { month: 'short' }).toUpperCase()}
                  </Text>
                  <Text style={styles.eventDateDay}>
                    {new Date(att.event.dateStart).getDate()}
                  </Text>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventName} numberOfLines={1}>{att.event.name}</Text>
                  <View style={styles.eventMeta}>
                    <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
                    <Text style={styles.eventLocation} numberOfLines={1}>{att.event.location}</Text>
                  </View>
                </View>
                <View style={[
                  styles.roleBadge,
                  att.role === 'creator' && styles.roleBadgeCreator,
                  att.role === 'both' && styles.roleBadgeBoth,
                ]}>
                  <Text style={styles.roleBadgeText}>{att.role}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending Bookings</Text>
            <Pressable onPress={() => router.push('/(tabs)/bookings')}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          {loadingBookings ? (
            <ActivityIndicator color={Colors.dark.primary} style={{ marginVertical: 20 }} />
          ) : pendingBookings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyText}>No pending bookings</Text>
              <Text style={styles.emptySubtext}>
                {user?.primaryRole === 'creator'
                  ? 'Booking requests will appear here'
                  : 'Find a creator at an event to book'}
              </Text>
            </View>
          ) : (
            pendingBookings.map((booking: any) => (
              <Pressable
                key={booking.id}
                onPress={() => router.push('/(tabs)/bookings')}
                style={({ pressed }) => [
                  styles.bookingCard,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.bookingAvatar}>
                  <Text style={styles.bookingAvatarText}>
                    {(user?.id === booking.driverId
                      ? booking.creator?.displayName
                      : booking.driver?.displayName
                    )?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingName} numberOfLines={1}>
                    {user?.id === booking.driverId
                      ? booking.creator?.displayName
                      : booking.driver?.displayName}
                  </Text>
                  <Text style={styles.bookingEvent} numberOfLines={1}>
                    {booking.event?.name}
                  </Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pending</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, onPress, accent }: {
  icon: string; label: string; onPress: () => void; accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        accent && styles.quickActionAccent,
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Ionicons
        name={icon as any}
        size={24}
        color={accent ? Colors.dark.primary : Colors.dark.textSecondary}
      />
      <Text style={[
        styles.quickActionLabel,
        accent && { color: Colors.dark.primary },
      ]}>{label}</Text>
    </Pressable>
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
  greeting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  greetingLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  greetingName: {
    fontSize: 24,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  avatarButton: {
    borderRadius: radius.full,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  quickActionAccent: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primaryMuted,
  },
  quickActionLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
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
    fontSize: 18,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  emptyCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textAlign: 'center',
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: spacing.md,
  },
  eventDateBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateMonth: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  eventDateDay: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: Colors.dark.primary,
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventName: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventLocation: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: Colors.dark.accentMuted,
  },
  roleBadgeCreator: {
    backgroundColor: Colors.dark.primaryMuted,
  },
  roleBadgeBoth: {
    backgroundColor: Colors.dark.warningMuted,
  },
  roleBadgeText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
    textTransform: 'capitalize',
  },
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: spacing.md,
  },
  bookingAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingAvatarText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: Colors.dark.textSecondary,
  },
  bookingInfo: {
    flex: 1,
    gap: 2,
  },
  bookingName: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  bookingEvent: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  pendingBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: Colors.dark.warningMuted,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: Colors.dark.warning,
  },
});
