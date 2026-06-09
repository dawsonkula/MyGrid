import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Platform, Modal, TextInput, Alert, Linking,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQueryFn, apiRequest, queryClient } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

const PLATFORM_FEE_LABEL = 'MyGrid fee (10%)';

const STATUS_META: Record<string, { label: string; bg: string; color: string; icon: string; gradientColors: [string, string] }> = {
  requested:         { label: 'Pending Review', bg: Colors.dark.warningMuted, color: Colors.dark.warning, icon: 'time-outline', gradientColors: ['rgba(240,160,48,0.12)', 'rgba(240,160,48,0.04)'] },
  accepted:          { label: 'Accepted', bg: Colors.dark.successMuted, color: Colors.dark.success, icon: 'checkmark-circle-outline', gradientColors: ['rgba(94,236,192,0.12)', 'rgba(94,236,192,0.04)'] },
  payment_pending:   { label: 'Payment Pending', bg: Colors.dark.warningMuted, color: Colors.dark.warning, icon: 'card-outline', gradientColors: ['rgba(240,160,48,0.12)', 'rgba(240,160,48,0.04)'] },
  paid:              { label: 'Paid', bg: Colors.dark.successMuted, color: Colors.dark.success, icon: 'checkmark-done-outline', gradientColors: ['rgba(94,236,192,0.12)', 'rgba(94,236,192,0.04)'] },
  in_progress:       { label: 'In Progress', bg: Colors.dark.accentMuted, color: Colors.dark.accent, icon: 'camera-outline', gradientColors: ['rgba(176,130,255,0.12)', 'rgba(176,130,255,0.04)'] },
  footage_delivered: { label: 'Footage Delivered', bg: Colors.dark.accentMuted, color: Colors.dark.accent, icon: 'film-outline', gradientColors: ['rgba(176,130,255,0.12)', 'rgba(176,130,255,0.04)'] },
  completed:         { label: 'Completed', bg: Colors.dark.successMuted, color: Colors.dark.success, icon: 'ribbon-outline', gradientColors: ['rgba(94,236,192,0.12)', 'rgba(94,236,192,0.04)'] },
  declined:          { label: 'Declined', bg: Colors.dark.errorMuted, color: Colors.dark.error, icon: 'close-circle-outline', gradientColors: ['rgba(240,80,80,0.12)', 'rgba(240,80,80,0.04)'] },
  cancelled:         { label: 'Cancelled', bg: Colors.dark.errorMuted, color: Colors.dark.error, icon: 'ban-outline', gradientColors: ['rgba(240,80,80,0.12)', 'rgba(240,80,80,0.04)'] },
  disputed:          { label: 'Disputed', bg: Colors.dark.errorMuted, color: Colors.dark.error, icon: 'alert-circle-outline', gradientColors: ['rgba(240,80,80,0.12)', 'rgba(240,80,80,0.04)'] },
};

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  photo_gallery: 'Photo Gallery',
  video_file: 'Video File',
  external_link: 'Link',
  google_drive: 'Google Drive',
  dropbox: 'Dropbox',
  youtube_unlisted: 'YouTube',
  other: 'Other',
};

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('');
  const [deliveryTitle, setDeliveryTitle] = useState('');
  const [deliveryType, setDeliveryType] = useState('external_link');
  const [deliveryLink, setDeliveryLink] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [payNowLoading, setPayNowLoading] = useState(false);

  const { data: booking, isLoading, isError } = useQuery<any>({
    queryKey: ['/api/bookings', id],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!id,
  });

  const { data: deliveries = [], refetch: refetchDeliveries } = useQuery<any[]>({
    queryKey: [`/api/bookings/${id}/deliveries`],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!id,
    select: (data) => data ?? [],
  });

  useFocusEffect(
    useCallback(() => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['/api/bookings', id] });
        queryClient.invalidateQueries({ queryKey: [`/api/bookings/${id}/deliveries`] });
      }
    }, [id])
  );

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest('PUT', `/api/bookings/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    },
  });

  const handleAddDelivery = async () => {
    if (!deliveryTitle.trim()) return;
    setActionLoading(true);
    try {
      await apiRequest('POST', '/api/deliveries', {
        bookingId: id,
        deliveryType,
        title: deliveryTitle.trim(),
        notes: deliveryNotes.trim() || undefined,
        externalLink: deliveryLink.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${id}/deliveries`] });
      setShowDeliveryModal(false);
      setDeliveryTitle('');
      setDeliveryLink('');
      setDeliveryNotes('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add delivery');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveDelivery = async (deliveryId: string) => {
    Alert.alert(
      'Approve & Complete Booking',
      'This will mark the delivery as approved and complete the booking.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await apiRequest('PUT', `/api/deliveries/${deliveryId}/status`, { status: 'approved' });
              queryClient.invalidateQueries({ queryKey: [`/api/bookings/${id}/deliveries`] });
              queryClient.invalidateQueries({ queryKey: ['/api/bookings', id] });
              queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
              Alert.alert('Booking completed successfully', 'The delivery has been approved.');
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const handleRevisionRequest = async () => {
    if (!revisionNotes.trim()) return;
    setActionLoading(true);
    try {
      await apiRequest('PUT', `/api/deliveries/${selectedDeliveryId}/status`, {
        status: 'revision_requested',
        revisionNotes: revisionNotes.trim(),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${id}/deliveries`] });
      setShowRevisionModal(false);
      setRevisionNotes('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayNow = async () => {
    if (!id) return;
    setPayNowLoading(true);
    try {
      const data = await apiRequest('POST', `/api/bookings/${id}/create-checkout-session`, {});
      if (data?.url) {
        await Linking.openURL(data.url);
        queryClient.invalidateQueries({ queryKey: ['/api/bookings', id] });
      } else {
        Alert.alert('Error', 'Could not create payment session. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Payment Error', err.message || 'Failed to start payment. Please try again.');
    } finally {
      setPayNowLoading(false);
    }
  };

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.errorText}>Booking not found</Text>
        </View>
      </View>
    );
  }

  const isCreator = user?.id === booking.creatorId;
  const isDriver = user?.id === booking.driverId;
  const otherUser = isCreator ? booking.driver : booking.creator;
  const statusMeta = STATUS_META[booking.status] || STATUS_META.requested;

  const packagePrice = booking.packagePrice ? parseFloat(booking.packagePrice) : null;
  const platformFee = booking.platformFeeAmount ? parseFloat(booking.platformFeeAmount) : null;
  const creatorPayout = booking.creatorPayoutAmount ? parseFloat(booking.creatorPayoutAmount) : null;
  const hasPaymentSummary = packagePrice !== null && packagePrice > 0;

  const dateStart = booking.event?.dateStart ? new Date(booking.event.dateStart) : null;

  const canCreatorAct = isCreator;
  const canDriverCancel = isDriver && booking.status === 'requested';
  const deliveryableStatuses = ['accepted', 'payment_pending', 'paid', 'in_progress', 'footage_delivered'];
  const canAddDelivery = isCreator && deliveryableStatuses.includes(booking.status);

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Booking</Text>
        <Pressable
          onPress={() => router.push(`/chat/${otherUser?.id}`)}
          style={styles.chatBtn}
        >
          <Ionicons name="chatbubble-outline" size={20} color={Colors.dark.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status Hero ── */}
        <LinearGradient
          colors={statusMeta.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statusHero}
        >
          <View style={[styles.statusIconWrap, { backgroundColor: statusMeta.bg }]}>
            <Ionicons name={statusMeta.icon as any} size={26} color={statusMeta.color} />
          </View>
          <Text style={[styles.statusLabel, { color: statusMeta.color }]}>{statusMeta.label}</Text>
          {booking.event?.name && (
            <Text style={styles.statusEventName} numberOfLines={2}>{booking.event.name}</Text>
          )}
          {dateStart && (
            <View style={styles.statusDateRow}>
              <Ionicons name="calendar-outline" size={13} color={Colors.dark.textMuted} />
              <Text style={styles.statusDate}>
                {dateStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* ── People Card ── */}
        <View style={styles.peopleCard}>
          <PeopleAvatar
            name={booking.driver?.displayName || 'Driver'}
            role="Driver"
            roleColor={Colors.dark.primary}
            onPress={() => router.push(`/profile/${booking.driver?.id}`)}
          />
          <View style={styles.peopleDivider}>
            <View style={styles.peopleDividerLine} />
            <View style={styles.peopleDividerIcon}>
              <Ionicons name="camera" size={14} color={Colors.dark.primary} />
            </View>
            <View style={styles.peopleDividerLine} />
          </View>
          <PeopleAvatar
            name={booking.creator?.displayName || 'Creator'}
            role="Creator"
            roleColor={Colors.dark.accent}
            onPress={() => router.push(`/profile/${booking.creator?.id}`)}
          />
        </View>

        {/* ── Package Card ── */}
        {booking.pkg && (
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <Ionicons name="pricetag-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.cardLabel}>Package</Text>
            </View>
            <Text style={styles.packageName}>{booking.pkg.title}</Text>
            {booking.pkg.description && (
              <Text style={styles.packageDesc}>{booking.pkg.description}</Text>
            )}
            {booking.notes && (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>Driver notes</Text>
                <Text style={styles.notesText}>{booking.notes}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Payment Clarity Banner ── */}
        {booking.status === 'requested' && isDriver && (
          <View style={styles.clarityBanner}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.dark.success} />
            <Text style={styles.clarityText}>
              You won't be charged until the creator accepts your request.
            </Text>
          </View>
        )}

        {/* ── Payment Summary ── */}
        {hasPaymentSummary && (
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <Ionicons name="receipt-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.cardLabel}>Payment Summary</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Package price</Text>
              <Text style={styles.receiptValue}>${packagePrice!.toFixed(2)}</Text>
            </View>
            {platformFee !== null && (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>{PLATFORM_FEE_LABEL}</Text>
                <Text style={[styles.receiptValue, { color: Colors.dark.textMuted }]}>
                  −${platformFee.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={styles.receiptDivider} />
            {creatorPayout !== null && (
              <View style={styles.receiptRow}>
                <Text style={[styles.receiptLabel, { fontFamily: fonts.semiBold, color: Colors.dark.text }]}>
                  Creator receives
                </Text>
                <Text style={[styles.receiptTotal, { color: Colors.dark.success }]}>
                  ${creatorPayout.toFixed(2)}
                </Text>
              </View>
            )}
            {['requested', 'accepted', 'payment_pending'].includes(booking.status) && (
              <View style={styles.pendingPaymentNote}>
                <Ionicons name="time-outline" size={13} color={Colors.dark.warning} />
                <Text style={styles.pendingPaymentText}>
                  Payment required after booking is accepted.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Deliveries ── */}
        <View style={styles.card}>
          <View style={styles.deliveriesHeader}>
            <View style={styles.cardLabelRow}>
              <Ionicons name="cloud-upload-outline" size={14} color={Colors.dark.primary} />
              <Text style={styles.cardLabel}>Deliveries</Text>
            </View>
            {canAddDelivery && (
              <Pressable onPress={() => setShowDeliveryModal(true)} style={styles.addBtn}>
                <Ionicons name="add" size={16} color={Colors.dark.primary} />
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            )}
          </View>

          {deliveries.length === 0 ? (
            <View style={styles.emptyDeliveries}>
              <Ionicons name="film-outline" size={24} color={Colors.dark.textMuted} />
              <Text style={styles.emptyDeliveriesText}>
                {canAddDelivery
                  ? 'Share your work — add a delivery link or file.'
                  : 'No deliveries yet.'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {deliveries.map((d: any) => (
                <DeliveryItem
                  key={d.id}
                  delivery={d}
                  isDriver={isDriver}
                  onApprove={() => handleApproveDelivery(d.id)}
                  onRequestRevision={() => {
                    setSelectedDeliveryId(d.id);
                    setShowRevisionModal(true);
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Primary Actions ── */}
        <View style={styles.actionsSection}>
          {/* Creator: Accept / Decline */}
          {canCreatorAct && booking.status === 'requested' && (
            <View style={styles.actionPair}>
              <Pressable
                onPress={() => statusMutation.mutate('accepted')}
                style={[styles.actionPairBtn, styles.acceptBtn]}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.success} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.dark.success} />
                    <Text style={[styles.actionPairBtnText, { color: Colors.dark.success }]}>Accept</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => statusMutation.mutate('declined')}
                style={[styles.actionPairBtn, styles.declineBtn]}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
                <Text style={[styles.actionPairBtnText, { color: Colors.dark.error }]}>Decline</Text>
              </Pressable>
            </View>
          )}

          {/* Driver: Pay Now */}
          {isDriver && ['accepted', 'payment_pending'].includes(booking.status) && (
            <Pressable
              onPress={handlePayNow}
              style={styles.primaryBtn}
              disabled={payNowLoading}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtnGradient}
              >
                {payNowLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card" size={20} color="#fff" />
                    <Text style={styles.primaryBtnText}>Pay Now</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}

          {/* Creator: Waiting for payment */}
          {isCreator && ['accepted', 'payment_pending'].includes(booking.status) && (
            <View style={styles.waitingBanner}>
              <Ionicons name="hourglass-outline" size={18} color={Colors.dark.warning} />
              <Text style={styles.waitingText}>Waiting for driver payment</Text>
            </View>
          )}

          {/* Creator: Mark footage delivered */}
          {canCreatorAct && booking.status === 'in_progress' && (
            <Pressable
              onPress={() => statusMutation.mutate('footage_delivered')}
              style={[styles.secondaryBtn, { backgroundColor: Colors.dark.accentMuted }]}
              disabled={statusMutation.isPending}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.dark.accent} />
              <Text style={[styles.secondaryBtnText, { color: Colors.dark.accent }]}>
                Mark Footage Delivered
              </Text>
            </Pressable>
          )}

          {/* Creator: Mark completed */}
          {canCreatorAct && booking.status === 'footage_delivered' && (
            <Pressable
              onPress={() => statusMutation.mutate('completed')}
              style={[styles.secondaryBtn, { backgroundColor: Colors.dark.successMuted }]}
              disabled={statusMutation.isPending}
            >
              <Ionicons name="checkmark-done" size={18} color={Colors.dark.success} />
              <Text style={[styles.secondaryBtnText, { color: Colors.dark.success }]}>
                Mark Completed
              </Text>
            </Pressable>
          )}

          {/* Driver: Cancel */}
          {canDriverCancel && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Cancel Booking',
                  'Are you sure you want to cancel this booking request?',
                  [
                    { text: 'Keep it', style: 'cancel' },
                    {
                      text: 'Cancel Booking',
                      style: 'destructive',
                      onPress: () => statusMutation.mutate('cancelled'),
                    },
                  ]
                );
              }}
              style={[styles.secondaryBtn, { backgroundColor: Colors.dark.errorMuted }]}
              disabled={statusMutation.isPending}
            >
              <Ionicons name="close-circle-outline" size={18} color={Colors.dark.error} />
              <Text style={[styles.secondaryBtnText, { color: Colors.dark.error }]}>
                Cancel Request
              </Text>
            </Pressable>
          )}
        </View>

        <View style={{ height: Math.max(insets.bottom, webBottomInset) + 40 }} />
      </ScrollView>

      {/* ── Add Delivery Modal ── */}
      <Modal visible={showDeliveryModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Delivery</Text>
            <View style={styles.typeRow}>
              {(['external_link', 'google_drive', 'dropbox', 'youtube_unlisted', 'photo_gallery', 'other'] as const).map(t => (
                <Pressable
                  key={t}
                  onPress={() => setDeliveryType(t)}
                  style={[styles.typeChip, deliveryType === t && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, deliveryType === t && styles.typeChipTextActive]}>
                    {DELIVERY_TYPE_LABELS[t]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={deliveryTitle}
              onChangeText={setDeliveryTitle}
              placeholder="Title (e.g. Day 1 Photos)"
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.modalInput}
            />
            <TextInput
              value={deliveryLink}
              onChangeText={setDeliveryLink}
              placeholder="Link (Google Drive, Dropbox, YouTube...)"
              placeholderTextColor={Colors.dark.textMuted}
              style={styles.modalInput}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TextInput
              value={deliveryNotes}
              onChangeText={setDeliveryNotes}
              placeholder="Notes (optional)"
              placeholderTextColor={Colors.dark.textMuted}
              style={[styles.modalInput, styles.modalTextarea]}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowDeliveryModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddDelivery}
                style={[styles.modalSubmitBtn, (!deliveryTitle.trim() || actionLoading) && { opacity: 0.5 }]}
                disabled={!deliveryTitle.trim() || actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Add Delivery</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Request Revision Modal ── */}
      <Modal visible={showRevisionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Request Revision</Text>
            <TextInput
              value={revisionNotes}
              onChangeText={setRevisionNotes}
              placeholder="Describe what needs to be changed..."
              placeholderTextColor={Colors.dark.textMuted}
              style={[styles.modalInput, styles.modalTextarea]}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowRevisionModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleRevisionRequest}
                style={[styles.modalSubmitBtn, (!revisionNotes.trim() || actionLoading) && { opacity: 0.5 }]}
                disabled={!revisionNotes.trim() || actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PeopleAvatar({ name, role, roleColor, onPress }: {
  name: string; role: string; roleColor: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.personWrap}>
      <LinearGradient
        colors={['rgba(176,130,255,0.2)', 'rgba(176,130,255,0.05)']}
        style={styles.personAvatar}
      >
        <Text style={styles.personAvatarText}>{name[0].toUpperCase()}</Text>
      </LinearGradient>
      <Text style={styles.personName} numberOfLines={1}>{name}</Text>
      <View style={[styles.personRolePill, { backgroundColor: `${roleColor}22` }]}>
        <Text style={[styles.personRoleText, { color: roleColor }]}>{role}</Text>
      </View>
    </Pressable>
  );
}

function DeliveryItem({ delivery, isDriver, onApprove, onRequestRevision }: {
  delivery: any;
  isDriver: boolean;
  onApprove: () => void;
  onRequestRevision: () => void;
}) {
  const DELIVERY_STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
    pending:            { bg: Colors.dark.warningMuted, color: Colors.dark.warning, label: 'Pending' },
    uploaded:           { bg: Colors.dark.accentMuted, color: Colors.dark.accent, label: 'Uploaded' },
    delivered:          { bg: Colors.dark.accentMuted, color: Colors.dark.accent, label: 'Delivered' },
    revision_requested: { bg: Colors.dark.errorMuted, color: Colors.dark.error, label: 'Revision Requested' },
    approved:           { bg: Colors.dark.successMuted, color: Colors.dark.success, label: 'Approved' },
  };

  const sm = DELIVERY_STATUS_META[delivery.status] || DELIVERY_STATUS_META.pending;
  const hasLink = !!delivery.externalLink;
  const isFootageReady = isDriver && delivery.status === 'delivered';

  return (
    <View style={[styles.deliveryCard, isFootageReady && { borderColor: Colors.dark.primary }]}>
      {isFootageReady && (
        <View style={styles.footageReadyBanner}>
          <Ionicons name="film-outline" size={14} color={Colors.dark.primary} />
          <Text style={styles.footageReadyText}>Your footage is ready to review</Text>
        </View>
      )}

      <View style={styles.deliveryTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.deliveryTitle}>{delivery.title}</Text>
          <Text style={styles.deliveryTypeLabel}>{DELIVERY_TYPE_LABELS[delivery.deliveryType] || 'Delivery'}</Text>
        </View>
        <View style={[styles.deliveryStatusBadge, { backgroundColor: sm.bg }]}>
          <Text style={[styles.deliveryStatusText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      {delivery.notes ? (
        <Text style={styles.deliveryNotes}>{delivery.notes}</Text>
      ) : null}

      {delivery.revisionNotes && delivery.status === 'revision_requested' ? (
        <View style={styles.revisionBox}>
          <Ionicons name="alert-circle-outline" size={13} color={Colors.dark.error} />
          <Text style={styles.revisionText}>{delivery.revisionNotes}</Text>
        </View>
      ) : null}

      <View style={styles.deliveryActions}>
        {hasLink && (
          <Pressable
            onPress={() => delivery.externalLink && Linking.openURL(delivery.externalLink)}
            style={styles.openLinkBtn}
          >
            <Ionicons name="open-outline" size={15} color={Colors.dark.primary} />
            <Text style={styles.openLinkText}>Open Link</Text>
          </Pressable>
        )}
        {isDriver && delivery.status === 'delivered' && (
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Pressable onPress={onApprove} style={styles.approveBtn}>
              <Ionicons name="checkmark-circle" size={17} color="#fff" />
              <Text style={styles.approveBtnText}>Approve & Complete</Text>
            </Pressable>
            <Pressable
              onPress={onRequestRevision}
              style={[styles.revisionBtn]}
            >
              <Ionicons name="refresh-outline" size={15} color={Colors.dark.error} />
              <Text style={styles.revisionBtnText}>Request Revision</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.dark.surface,
  },
  headerTitle: {
    fontSize: 16, fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  chatBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.dark.primaryMuted,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },

  errorText: {
    fontSize: 16, fontFamily: fonts.regular,
    color: Colors.dark.textMuted, textAlign: 'center',
  },

  // Status Hero
  statusHero: {
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  statusIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statusLabel: {
    fontSize: 13, fontFamily: fonts.semiBold,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  statusEventName: {
    fontSize: 20, fontFamily: fonts.headingBold,
    color: Colors.dark.text, textAlign: 'center',
    lineHeight: 26,
  },
  statusDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: spacing.xs,
  },
  statusDate: {
    fontSize: 13, fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },

  // People card
  peopleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: spacing.lg,
  },
  personWrap: {
    flex: 1, alignItems: 'center', gap: spacing.xs,
  },
  personAvatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  personAvatarText: {
    fontSize: 20, fontFamily: fonts.bold, color: Colors.dark.primary,
  },
  personName: {
    fontSize: 14, fontFamily: fonts.semiBold,
    color: Colors.dark.text, textAlign: 'center',
  },
  personRolePill: {
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.full,
  },
  personRoleText: {
    fontSize: 10, fontFamily: fonts.semiBold,
  },
  peopleDivider: {
    alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md,
  },
  peopleDividerLine: {
    width: 1, height: 16, backgroundColor: Colors.dark.border,
  },
  peopleDividerIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
  },

  // Card
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  cardLabel: {
    fontSize: 11, fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // Package
  packageName: {
    fontSize: 17, fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  packageDesc: {
    fontSize: 14, fontFamily: fonts.regular,
    color: Colors.dark.textSecondary, lineHeight: 20,
  },
  notesBox: {
    backgroundColor: Colors.dark.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  notesLabel: {
    fontSize: 11, fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  notesText: {
    fontSize: 14, fontFamily: fonts.regular,
    color: Colors.dark.text, lineHeight: 20,
  },

  // Clarity banner
  clarityBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: Colors.dark.successMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  clarityText: {
    flex: 1, fontSize: 13, fontFamily: fonts.regular,
    color: Colors.dark.success, lineHeight: 19,
  },

  // Receipt
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 14, fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  receiptValue: {
    fontSize: 15, fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  receiptDivider: {
    height: 1, backgroundColor: Colors.dark.border,
    marginVertical: spacing.xs,
  },
  receiptTotal: {
    fontSize: 18, fontFamily: fonts.condensedBold,
  },
  pendingPaymentNote: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  pendingPaymentText: {
    fontSize: 12, fontFamily: fonts.regular,
    color: Colors.dark.warning, flex: 1,
  },

  // Deliveries
  deliveriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.dark.primaryMuted,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.sm,
  },
  addBtnText: {
    fontSize: 13, fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  emptyDeliveries: {
    alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptyDeliveriesText: {
    fontSize: 13, fontFamily: fonts.regular,
    color: Colors.dark.textMuted, textAlign: 'center',
  },

  // Delivery card
  deliveryCard: {
    backgroundColor: Colors.dark.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  footageReadyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: Colors.dark.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  footageReadyText: {
    fontSize: 12, fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  deliveryTop: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
  },
  deliveryTitle: {
    fontSize: 14, fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  deliveryTypeLabel: {
    fontSize: 12, fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  deliveryStatusBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.sm, flexShrink: 0,
  },
  deliveryStatusText: {
    fontSize: 11, fontFamily: fonts.semiBold,
  },
  deliveryNotes: {
    fontSize: 13, fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  revisionBox: {
    flexDirection: 'row', gap: spacing.xs,
    backgroundColor: Colors.dark.errorMuted,
    borderRadius: radius.sm, padding: spacing.sm,
    alignItems: 'flex-start',
  },
  revisionText: {
    fontSize: 13, fontFamily: fonts.regular,
    color: Colors.dark.error, flex: 1,
  },
  deliveryActions: {
    flexDirection: 'row', gap: spacing.sm,
  },
  openLinkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.dark.primaryMuted,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm,
  },
  openLinkText: {
    fontSize: 13, fontFamily: fonts.medium,
    color: Colors.dark.primary,
  },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: radius.md, paddingVertical: spacing.md,
  },
  approveBtnText: {
    fontSize: 14, fontFamily: fonts.semiBold, color: '#fff',
  },
  revisionBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.xs,
    backgroundColor: Colors.dark.errorMuted,
    borderRadius: radius.md, paddingVertical: spacing.sm,
  },
  revisionBtnText: {
    fontSize: 13, fontFamily: fonts.medium,
    color: Colors.dark.error,
  },

  // Actions section
  actionsSection: { gap: spacing.sm },

  actionPair: { flexDirection: 'row', gap: spacing.sm },
  actionPairBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.lg, borderRadius: radius.md,
  },
  acceptBtn: { backgroundColor: Colors.dark.successMuted },
  declineBtn: { backgroundColor: Colors.dark.errorMuted },
  actionPairBtnText: {
    fontSize: 15, fontFamily: fonts.semiBold,
  },

  primaryBtn: {
    borderRadius: radius.md, overflow: 'hidden',
  },
  primaryBtnGradient: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  primaryBtnText: {
    fontSize: 16, fontFamily: fonts.bold, color: '#fff',
  },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.md,
  },
  secondaryBtnText: {
    fontSize: 15, fontFamily: fonts.semiBold,
  },

  waitingBanner: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm,
    backgroundColor: Colors.dark.warningMuted,
    borderRadius: radius.md, paddingVertical: spacing.md,
  },
  waitingText: {
    fontSize: 14, fontFamily: fonts.medium,
    color: Colors.dark.warning,
  },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xxl, gap: spacing.md,
  },
  modalTitle: {
    fontSize: 18, fontFamily: fonts.headingBold,
    color: Colors.dark.text, marginBottom: spacing.xs,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeChip: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: Colors.dark.background,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  typeChipActive: {
    backgroundColor: Colors.dark.primaryMuted,
    borderColor: Colors.dark.primary,
  },
  typeChipText: {
    fontSize: 12, fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  typeChipTextActive: { color: Colors.dark.primary },
  modalInput: {
    backgroundColor: Colors.dark.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: 15, fontFamily: fonts.regular,
    color: Colors.dark.text,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  modalTextarea: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs,
  },
  modalCancelBtn: {
    flex: 1, alignItems: 'center',
    paddingVertical: spacing.md, borderRadius: radius.md,
    backgroundColor: Colors.dark.background,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  modalCancelText: {
    fontSize: 15, fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  modalSubmitBtn: {
    flex: 2, alignItems: 'center',
    paddingVertical: spacing.md, borderRadius: radius.md,
    backgroundColor: Colors.dark.primary,
  },
  modalSubmitText: {
    fontSize: 15, fontFamily: fonts.semiBold, color: '#fff',
  },
});
