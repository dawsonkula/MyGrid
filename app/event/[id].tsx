import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Platform, Modal, Image,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQueryFn, apiRequest, queryClient, getApiUrl } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'driver' | 'creator' | 'both' | null>(null);
  const [maxBookings, setMaxBookings] = useState(3);

  const { data: event, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['/api/events', id],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const { data: attendees = [], refetch: refetchAttendees } = useQuery<any[]>({
    queryKey: [`/api/events/${id}/attendees`],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!id,
    select: (data) => data ?? [],
  });

  const { data: enrichedCreators = [], refetch: refetchCreators } = useQuery<any[]>({
    queryKey: [`/api/events/${id}/creators`],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!id && !!user,
    select: (data) => data ?? [],
  });

  useFocusEffect(
    useCallback(() => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['/api/events', id] });
        queryClient.invalidateQueries({ queryKey: [`/api/events/${id}/attendees`] });
        queryClient.invalidateQueries({ queryKey: [`/api/events/${id}/creators`] });
      }
    }, [id])
  );

  const myAttendance = attendees.find((a: any) => a.userId === user?.id);
  const drivers = attendees.filter((a: any) => a.role === 'driver' || a.role === 'both');
  const creators = attendees.filter((a: any) => a.role === 'creator' || a.role === 'both');

  const handleJoin = async (role: 'driver' | 'creator' | 'both') => {
    setJoinLoading(true);
    try {
      const body: any = { role };
      if (role !== 'driver') {
        body.maxBookings = maxBookings;
      }
      await apiRequest('POST', `/api/events/${id}/join`, body);
      queryClient.invalidateQueries({ queryKey: [`/api/events/${id}/attendees`] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      refetchAttendees();
      setShowJoinModal(false);
      setSelectedRole(null);
      setMaxBookings(3);
    } catch (err) {
      console.error(err);
    } finally {
      setJoinLoading(false);
    }
  };

  const handleLeave = async () => {
    try {
      await apiRequest('POST', `/api/events/${id}/leave`);
      queryClient.invalidateQueries({ queryKey: [`/api/events/${id}/attendees`] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      refetchAttendees();
    } catch (err) {
      console.error(err);
    }
  };

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { paddingTop: topPadding, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={Colors.dark.textMuted} />
        <Text style={[styles.errorText, { marginTop: 16 }]}>Failed to load event</Text>
        <Pressable onPress={() => refetch()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.dark.primaryMuted, borderRadius: 10 }}>
          <Text style={{ color: Colors.dark.primary, fontFamily: fonts.semiBold, fontSize: 15 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  const dateStart = new Date(event.dateStart);
  const dateEnd = new Date(event.dateEnd);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerText} numberOfLines={1}>Event Details</Text>
        <View style={{ width: 40 }} />
      </View>

      {event.bannerImage && event.bannerImage.length > 0 && (
        <View style={styles.bannerContainer}>
          <Image
            source={{
              uri: event.bannerImage.startsWith('http')
                ? event.bannerImage
                : `${getApiUrl()}${event.bannerImage}`,
            }}
            style={styles.bannerImage}
            resizeMode="cover"
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['rgba(255,77,0,0.15)', 'rgba(255,77,0,0.02)']}
          style={styles.eventBanner}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="flag" size={48} color={Colors.dark.primary} />
        </LinearGradient>

        <Text style={styles.eventName}>{event.name}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location" size={16} color={Colors.dark.primary} />
            <Text style={styles.metaText}>
              {event.venue ? `${event.venue}, ${event.location}` : event.location}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="calendar" size={16} color={Colors.dark.primary} />
            <Text style={styles.metaText}>
              {dateStart.toLocaleDateString()} - {dateEnd.toLocaleDateString()}
            </Text>
          </View>
        </View>

        {event.description ? (
          <Text style={styles.description}>{event.description}</Text>
        ) : null}

        <View style={styles.actionRow}>
          {myAttendance ? (
            <View style={styles.attendingRow}>
              <View style={styles.attendingBadge}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.dark.success} />
                <Text style={styles.attendingText}>Attending as {myAttendance.role}</Text>
              </View>
              <Pressable onPress={handleLeave} style={styles.leaveButton}>
                <Text style={styles.leaveText}>Leave</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowJoinModal(true)}
              style={styles.joinButton}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.primaryDark]}
                style={styles.joinGradient}
              >
                <Text style={styles.joinText}>Join This Event</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>

        <View style={styles.attendeeSection}>
          <Text style={styles.sectionTitle}>
            Drivers ({drivers.length})
          </Text>
          {drivers.length === 0 ? (
            <Text style={styles.noAttendees}>No drivers yet</Text>
          ) : (
            drivers.map((att: any) => (
              <AttendeeCard
                key={att.id}
                attendee={att}
                onPress={() => router.push(`/profile/${att.userId}`)}
                onMessage={() => router.push(`/chat/${att.userId}`)}
                onBook={user?.primaryRole !== 'driver' ? () => {
                  router.push({
                    pathname: '/booking/create',
                    params: { creatorId: user?.id, driverId: att.userId, eventId: id },
                  });
                } : undefined}
              />
            ))
          )}
        </View>

        <View style={styles.attendeeSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Available Creators</Text>
            {creators.length > 0 && (
              <View style={{ backgroundColor: Colors.dark.primary, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: fonts.bold, color: Colors.dark.background }}>{creators.length}</Text>
              </View>
            )}
          </View>
          {creators.length === 0 ? (
            <Text style={styles.noAttendees}>No media creators yet</Text>
          ) : enrichedCreators.length > 0 ? (
            enrichedCreators
              .filter((ec: any) => user?.id !== ec.userId)
              .map((ec: any) => (
                <CreatorBookingCard
                  key={ec.id}
                  creator={ec}
                  onViewProfile={() => router.push(`/profile/${ec.userId}`)}
                  onBook={() => {
                    router.push({
                      pathname: '/booking/create',
                      params: { creatorId: ec.userId, eventId: id },
                    });
                  }}
                  onMessage={() => router.push(`/chat/${ec.userId}`)}
                  isSelf={user?.id === ec.userId}
                />
              ))
          ) : (
            creators
              .filter((att: any) => user?.id !== att.userId)
              .map((att: any) => (
                <AttendeeCard
                  key={att.id}
                  attendee={att}
                  showAvailability
                  onPress={() => router.push(`/profile/${att.userId}`)}
                  onMessage={() => router.push(`/chat/${att.userId}`)}
                  onBook={() => {
                    router.push({
                      pathname: '/booking/create',
                      params: { creatorId: att.userId, eventId: id },
                    });
                  }}
                />
              ))
          )}
          {user && creators.find((a: any) => a.userId === user.id) && (
            <View style={styles.selfCreatorNote}>
              <Ionicons name="person" size={14} color={Colors.dark.textMuted} />
              <Text style={styles.selfCreatorNoteText}>You are attending as a creator</Text>
            </View>
          )}
        </View>

        <View style={{ height: Math.max(insets.bottom, webBottomInset) + 40 }} />
      </ScrollView>

      <Modal visible={showJoinModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join as...</Text>
            <View style={styles.roleOptions}>
              {(['driver', 'creator', 'both'] as const).map(role => (
                <Pressable
                  key={role}
                  onPress={() => {
                    if (role === 'driver') {
                      handleJoin(role);
                    } else {
                      setSelectedRole(role);
                    }
                  }}
                  disabled={joinLoading}
                  style={({ pressed }) => [
                    styles.roleOption,
                    selectedRole === role && styles.roleOptionSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Ionicons
                    name={role === 'driver' ? 'car-sport' : role === 'creator' ? 'camera' : 'people'}
                    size={28}
                    color={selectedRole === role ? Colors.dark.text : Colors.dark.primary}
                  />
                  <Text style={[styles.roleOptionText, selectedRole === role && { color: Colors.dark.text }]}>
                    {role === 'both' ? 'Both' : role === 'driver' ? 'Driver' : 'Creator'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {(selectedRole === 'creator' || selectedRole === 'both') && (
              <View style={styles.maxBookingsSection}>
                <Text style={styles.maxBookingsLabel}>Max Bookings</Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => setMaxBookings(prev => Math.max(1, prev - 1))}
                    style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="remove" size={20} color={Colors.dark.text} />
                  </Pressable>
                  <Text style={styles.stepperValue}>{maxBookings}</Text>
                  <Pressable
                    onPress={() => setMaxBookings(prev => Math.min(20, prev + 1))}
                    style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="add" size={20} color={Colors.dark.text} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => handleJoin(selectedRole)}
                  disabled={joinLoading}
                  style={styles.confirmJoinButton}
                >
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.primaryDark]}
                    style={styles.confirmJoinGradient}
                  >
                    {joinLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.confirmJoinText}>Confirm & Join</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            )}
            <Pressable onPress={() => { setShowJoinModal(false); setSelectedRole(null); setMaxBookings(3); }} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CreatorBookingCard({ creator, onViewProfile, onBook, onMessage, isSelf }: {
  creator: any;
  onViewProfile: () => void;
  onBook: () => void;
  onMessage: () => void;
  isSelf: boolean;
}) {
  const availabilityColors: Record<string, { bg: string; text: string; label: string }> = {
    available: { bg: Colors.dark.successMuted, text: Colors.dark.success, label: 'Available' },
    limited: { bg: Colors.dark.warningMuted, text: Colors.dark.warning, label: 'Limited' },
    fully_booked: { bg: Colors.dark.errorMuted, text: Colors.dark.error, label: 'Fully Booked' },
  };
  const avail = availabilityColors[creator.availabilityStatus] || availabilityColors.available;
  const profileUri = creator.user?.profileImage
    ? creator.user.profileImage.startsWith('http')
      ? creator.user.profileImage
      : `${getApiUrl()}${creator.user.profileImage}`
    : null;
  const startingPrice = creator.startingPrice ? parseFloat(creator.startingPrice) : null;

  return (
    <View style={styles.creatorCard}>
      {/* Main row */}
      <Pressable onPress={onViewProfile} style={styles.creatorCardTop}>
        {/* Thumbnail */}
        <View style={styles.creatorAvatarWrap}>
          {profileUri ? (
            <Image source={{ uri: profileUri }} style={styles.creatorAvatar} />
          ) : (
            <View style={[styles.creatorAvatar, styles.creatorAvatarFallback]}>
              <Text style={styles.creatorAvatarText}>
                {(creator.user?.displayName || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {/* Info */}
        <View style={styles.creatorCardInfo}>
          <Text style={styles.creatorCardName} numberOfLines={1}>{creator.user?.displayName}</Text>
          <View style={styles.creatorCardMetaRow}>
            <View style={[styles.availBadge, { backgroundColor: avail.bg }]}>
              <Text style={[styles.availText, { color: avail.text }]}>{avail.label}</Text>
            </View>
            {creator.jobsCompleted > 0 && (
              <Text style={styles.creatorJobCount}>{creator.jobsCompleted} jobs</Text>
            )}
          </View>
        </View>
        {/* Price */}
        {startingPrice !== null && startingPrice > 0 && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.creatorFromLabel}>from</Text>
            <Text style={styles.creatorStartingPrice}>${startingPrice % 1 === 0 ? startingPrice.toFixed(0) : startingPrice.toFixed(2)}</Text>
          </View>
        )}
      </Pressable>
      {!isSelf && (
        <View style={styles.creatorCardActions}>
          <Pressable onPress={onMessage} style={styles.creatorMsgBtn}>
            <Ionicons name="chatbubble-outline" size={16} color={Colors.dark.textSecondary} />
          </Pressable>
          <Pressable onPress={onViewProfile} style={styles.creatorProfileBtn}>
            <Text style={styles.creatorProfileBtnText}>View</Text>
          </Pressable>
          <Pressable onPress={onBook} style={styles.creatorBookBtn}>
            <Text style={styles.creatorBookBtnText}>Book</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function AttendeeCard({ attendee, showAvailability, onPress, onMessage, onBook }: {
  attendee: any;
  showAvailability?: boolean;
  onPress: () => void;
  onMessage: () => void;
  onBook?: () => void;
}) {
  const availabilityColors: Record<string, { bg: string; text: string; label: string }> = {
    available: { bg: Colors.dark.successMuted, text: Colors.dark.success, label: 'Available' },
    limited: { bg: Colors.dark.warningMuted, text: Colors.dark.warning, label: 'Limited' },
    fully_booked: { bg: Colors.dark.errorMuted, text: Colors.dark.error, label: 'Fully Booked' },
  };

  const avail = availabilityColors[attendee.availabilityStatus] || availabilityColors.available;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.attendeeCard,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.attendeeAvatar}>
        <Text style={styles.attendeeAvatarText}>
          {(attendee.user?.displayName || '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.attendeeInfo}>
        <Text style={styles.attendeeName}>{attendee.user?.displayName}</Text>
        {showAvailability && (
          <View style={[styles.availBadge, { backgroundColor: avail.bg }]}>
            <Text style={[styles.availText, { color: avail.text }]}>{avail.label}</Text>
          </View>
        )}
      </View>
      <View style={styles.attendeeActions}>
        <Pressable onPress={onMessage} style={styles.attendeeActionBtn}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.textSecondary} />
        </Pressable>
        {onBook && (
          <Pressable onPress={onBook} style={[styles.attendeeActionBtn, styles.bookBtn]}>
            <Ionicons name="calendar-outline" size={18} color={Colors.dark.primary} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
  },
  bannerContainer: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
  },
  eventBanner: {
    height: 140,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  eventName: {
    fontSize: 26,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    marginBottom: spacing.md,
  },
  metaRow: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  description: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  errorText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textAlign: 'center',
    marginTop: 60,
  },
  actionRow: {
    marginBottom: spacing.xxl,
  },
  joinButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  joinGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  joinText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  attendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.dark.successMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  attendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  attendingText: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.success,
    textTransform: 'capitalize',
  },
  leaveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  leaveText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.error,
  },
  attendeeSection: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  noAttendees: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    fontStyle: 'italic',
  },
  attendeeCard: {
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
  attendeeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeAvatarText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: Colors.dark.textSecondary,
  },
  attendeeInfo: {
    flex: 1,
    gap: 4,
  },
  attendeeName: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  availBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  availText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
  },
  attendeeActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  attendeeActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtn: {
    backgroundColor: Colors.dark.primaryMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  modalContent: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 340,
    gap: spacing.xl,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    textAlign: 'center',
  },
  roleOptions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roleOption: {
    flex: 1,
    height: 88,
    backgroundColor: Colors.dark.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  roleOptionText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  roleOptionSelected: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
    backgroundColor: Colors.dark.primaryMuted,
  },
  maxBookingsSection: {
    gap: spacing.md,
  },
  maxBookingsLabel: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: Colors.dark.text,
    minWidth: 32,
    textAlign: 'center',
  },
  confirmJoinButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  confirmJoinGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  confirmJoinText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  // Creator booking cards
  creatorCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  creatorCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  creatorAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    overflow: 'hidden',
    flexShrink: 0,
  },
  creatorAvatar: {
    width: 48,
    height: 48,
  },
  creatorAvatarFallback: {
    backgroundColor: Colors.dark.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorAvatarText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: Colors.dark.textSecondary,
  },
  creatorCardInfo: {
    flex: 1,
    gap: 5,
  },
  creatorCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  creatorJobCount: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  creatorCardName: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  creatorFromLabel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textAlign: 'right',
  },
  creatorStartingPrice: {
    fontSize: 26,
    fontFamily: fonts.condensedBold,
  