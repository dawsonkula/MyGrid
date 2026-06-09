import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQueryFn, apiRequest, queryClient } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset } from '@/constants/theme';

const PLATFORM_FEE = 0.10;

type BookingFilter = 'all' | 'requested' | 'accepted' | 'in_progress' | 'footage_delivered' | 'completed' | 'declined' | 'cancelled';

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [filter, setFilter] = useState<BookingFilter>('all');

  const { data: bookings = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['/api/bookings'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    }, [])
  );

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest('PUT', `/api/bookings/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    },
  });

  const filteredBookings = filter === 'all'
    ? bookings
    : bookings.filter((b: any) => b.status === filter);

  // Count pending requests for badge
  const pendingCount = bookings.filter((b: any) => b.status === 'requested').length;

  const filters: { key: BookingFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'requested', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'in_progress', label: 'Active' },
    { key: 'footage_delivered', label: 'Delivered' },
    { key: 'completed', label: 'Done' },
    { key: 'declined', label: 'Declined' },
  ];

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + spacing.lg }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Bookings</Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount} new</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.filterScrollRow}>
        {filters.map(f => {
          const isActive = filter === f.key;
          const count = f.key === 'all'
            ? bookings.length
            : bookings.filter((b: any) => b.status === f.key).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {f.label}
              </Text>
              {count > 0 && (
                <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTitle}>No bookings</Text>
              <Text style={styles.emptySubtitle}>
                {user?.primaryRole === 'creator'
                  ? 'Booking requests from drivers will appear here'
                  : 'Book a media creator at an event to get started'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/booking/${item.id}` as any)}
              style={({ pressed }) => pressed ? { opacity: 0.85 } : undefined}
            >
              <BookingCard
                booking={item}
                userId={user?.id || ''}
                onAccept={() => updateStatusMutation.mutate({ id: item.id, status: 'accepted' })}
                onDecline={() => updateStatusMutation.mutate({ id: item.id, status: 'declined' })}
                onComplete={() => updateStatusMutation.mutate({ id: item.id, status: 'completed' })}
                onMessage={(otherUserId: string) => router.push(`/chat/${otherUserId}`)}
              />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function BookingCard({ booking, userId, onAccept, onDecline, onComplete, onMessage }: {
  booking: any;
  userId: string;
  onAccept: () => void;
  onDecline: () => void;
  onComplete: () => void;
  onMessage: (userId: string) => void;
}) {
  const isCreator = userId === booking.creatorId;
  const otherUser = isCreator ? booking.driver : booking.creator;
  const otherUserId = isCreator ? booking.driverId : booking.creatorId;
  const isNewRequest = booking.status === 'requested';

  const STATUS_LABEL: Record<string, string> = {
    requested: 'Pending',
    accepted: 'Accepted',
    payment_pending: 'Payment Pending',
    paid: 'Paid',
    in_progress: 'In Progress',
    footage_delivered: 'Delivered',
    completed: 'Completed',
    declined: 'Declined',
    cancelled: 'Cancelled',
    disputed: 'Disputed',
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    requested:          { bg: Colors.dark.warningMuted, text: Colors.dark.warning },
    accepted:           { bg: Colors.dark.successMuted, text: Colors.dark.success },
    payment_pending:    { bg: Colors.dark.warningMuted, text: Colors.dark.warning },
    paid:               { bg: Colors.dark.successMuted, text: Colors.dark.success },
    in_progress:        { bg: Colors.dark.accentMuted, text: Colors.dark.accent },
    footage_delivered:  { bg: Colors.dark.accentMuted, text: Colors.dark.accent },
    completed:          { bg: Colors.dark.successMuted, text: Colors.dark.success },
    declined:           { bg: Colors.dark.errorMuted, text: Colors.dark.error },
    cancelled:          { bg: Colors.dark.errorMuted, text: Colors.dark.error },
    disputed:           { bg: Colors.dark.errorMuted, text: Colors.dark.error },
  };

  const sc = statusColors[booking.status] || statusColors.requested;

  // Compute earnings for creator
  const rawPrice = booking.pkg?.price ? parseFloat(booking.pkg.price) : null;
  const creatorEarning = rawPrice !== null ? rawPrice * (1 - PLATFORM_FEE) : null;
  const driverTotal = rawPrice !== null ? rawPrice * (1 + PLATFORM_FEE) : null;

  const fmtMoney = (val: number) =>
    val % 1 === 0 ? `$${val.toFixed(0)}` : `$${val.toFixed(2)}`;

  return (
    <View style={[styles.bookingCard, isNewRequest && styles.bookingCardNew]}>
      {/* Header row */}
      <View style={styles.bookingCardHeader}>
        <View style={styles.bookingAvatarContainer}>
          <View style={[styles.bookingAvatar, isCreator && { backgroundColor: Colors.dark.primaryMuted }]}>
            <Text style={[styles.bookingAvatarText, isCreator && { color: Colors.dark.primary }]}>
              {(otherUser?.displayName || '?')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.bookingHeaderInfo}>
            <Text style={styles.bookingName} numberOfLines={1}>
              {otherUser?.displayName || 'Unknown'}
            </Text>
            <Text style={styles.bookingRole}>
              {isCreator ? 'Driver' : 'Creator'}
            </Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          {isNewRequest && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>
              {STATUS_LABEL[booking.status] || booking.status}
            </Text>
          </View>
        </View>
      </View>

      {/* Booking details */}
      <View style={styles.bookingDetails}>
        <View style={styles.bookingDetailRow}>
          <Ionicons name="flag-outline" size={15} color={Colors.dark.textMuted} />
          <Text style={styles.bookingDetailText} numberOfLines={1}>
            {booking.event?.name || 'Event'}
          </Text>
        </View>
        {booking.pkg && (
          <View style={styles.bookingDetailRow}>
            <Ionicons name="pricetag-outline" size={15} color={Colors.dark.textMuted} />
            <Text style={styles.bookingDetailText} numberOfLines={1}>
              {booking.pkg.title}
            </Text>
          </View>
        )}
      </View>

      {/* Earnings / price display */}
      {rawPrice !== null && (
        <View style={styles.earningsRow}>
          {isCreator ? (
            <>
              <View style={styles.earningsBlock}>
                <Text style={styles.earningsLabel}>You earn</Text>
                <Text style={styles.earningsValue}>{fmtMoney(creatorEarning!)}</Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsBlock}>
                <Text style={styles.earningsLabel}>Package price</Text>
                <Text style={styles.earningsPkg}>{fmtMoney(rawPrice)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.earningsBlock}>
                <Text style={styles.earningsLabel}>Total charged</Text>
                <Text style={styles.earningsValue}>{fmtMoney(driverTotal!)}</Text>
              </View>
              <View style={styles.earningsDivider} />
              <View style={styles.earningsBlock}>
                <Text style={styles.earningsLabel}>Package price</Text>
                <Text style={styles.earningsPkg}>{fmtMoney(rawPrice)}</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Action row */}
      <View style={styles.bookingActions}>
        {isCreator && booking.status === 'requested' && (
          <>
            <Pressable
              onPress={(e) => { e.stopPropagation(); onDecline(); }}
              style={({ pressed }) => [styles.actionBtn, styles.declineBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="close" size={15} color={Colors.dark.error} />
              <Text style={styles.declineBtnText}>Decline</Text>
            </Pressable>
            <Pressable
              onPress={(e) => { e.stopPropagation(); onAccept(); }}
              style={({ pressed }) => [styles.actionBtn, styles.acceptBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="checkmark" size={15} color={Colors.dark.background} />
              <Text style={styles.acceptBtnText}>Accept</Text>
            </Pressable>
          </>
        )}
        {isCreator && booking.status === 'accepted' && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onComplete(); }}
            style={({ pressed }) => [styles.actionBtn, styles.completeBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="checkmark-done" size={15} color={Colors.dark.background} />
            <Text style={styles.completeBtnText}>Mark Delivered</Text>
          </Pressable>
        )}
        <Pressable
          onPress={(e) => { e.stopPropagation(); onMessage(otherUserId); }}
          style={({ pressed }) => [styles.actionBtn, styles.messageBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="chatbubble-outline" size={15} color={Colors.dark.textSecondary} />
          <Text style={styles.messageBtnText}>Message</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  pendingBadge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: Colors.dark.background,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterScrollRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primaryMuted,
    borderColor: Colors.dark.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  filterChipTextActive: {
    color: Colors.dark.primary,
  },
  filterCount: {
    backgroundColor: Colors.dark.border,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterCountActive: {
    backgroundColor: Colors.dark.primary,
  },
  filterCountText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
  },
  filterCountTextActive: {
    color: Colors.dark.background,
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
    textAlign: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  bookingCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: spacing.md,
  },
  bookingCardNew: {
    borderColor: Colors.dark.primary,
    borderWidth: 1.5,
  },
  bookingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingAvatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  bookingAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingAvatarText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: Colors.dark.textSecondary,
  },
  bookingHeaderInfo: {
    flex: 1,
  },
  bookingName: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  bookingRole: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textTransform: 'capitalize',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  newBadge: {
    backgroundColor: Colors.dark.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontSize: 9,
    fontFamily: fonts.semiBold,
    color: Colors.dark.background,
    letterSpacing: 0.8,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    textTransform: 'capitalize',
  },
  bookingDetails: {
    gap: spacing.xs,
  },
  bookingDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bookingDetailText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  // Earnings strip
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surfaceHighlight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  earningsBlock: {
    flex: 1,
    gap: 2,
  },
  earningsLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  earningsValue: {
    fontSize: 26,
    fontFamily: fonts.condensedBold,
    color: Colors.dark.accent,
    lineHeight: 28,
  },
  earningsPkg: {
    fontSize: 22,
    fontFamily: fonts.condensedBold,
    color: Colors.dark.textSecondary,
    lineHeight: 24,
  },
  earningsDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.dark.border,
  },
  // Action buttons
  bookingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  acceptBtn: {
    backgroundColor: Colors.dark.success,
    borderColor: Colors.dark.success,
    flex: 2,
  },
  acceptBtnText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.background,
  },
  declineBtn: {
    backgroundColor: Colors.dark.errorMuted,
    borderColor: Colors.dark.errorMuted,
  },
  declineBtnText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.error,
  },
  completeBtn: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
    flex: 1,
  },
  completeBtnText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.background,
  },
  messageBtn: {
    backgroundColor: Colors.dark.surfaceHighlight,
  },
  messageBtnText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: Colors.dark.textSecondary,
  },
});
