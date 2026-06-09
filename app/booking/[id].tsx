import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Platform, Modal, TextInput, Alert, Linking,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQueryFn, apiRequest, queryClient } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

const PLATFORM_FEE_LABEL = 'MyGrid fee (10%)';

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  requested:          { label: 'Pending', bg: Colors.dark.warningMuted, color: Colors.dark.warning },
  accepted:           { label: 'Accepted', bg: Colors.dark.successMuted, color: Colors.dark.success },
  payment_pending:    { label: 'Payment Pending', bg: Colors.dark.warningMuted, color: Colors.dark.warning },
  paid:               { label: 'Paid', bg: Colors.dark.successMuted, color: Colors.dark.success },
  in_progress:        { label: 'In Progress', bg: Colors.dark.accentMuted, color: Colors.dark.accent },
  footage_delivered:  { label: 'Footage Delivered', bg: Colors.dark.accentMuted, color: Colors.dark.accent },
  completed:          { label: 'Completed', bg: Colors.dark.successMuted, color: Colors.dark.success },
  declined:           { label: 'Declined', bg: Colors.dark.errorMuted, color: Colors.dark.error },
  cancelled:          { label: 'Cancelled', bg: Colors.dark.errorMuted, color: Colors.dark.error },
  disputed:           { label: 'Disputed', bg: Colors.dark.errorMuted, color: Colors.dark.error },
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
              // Server auto-completes the booking when a delivery is approved
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
        // Refresh after returning
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
      <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={[styles.statusBanner, { backgroundColor: statusMeta.bg }]}>
          <Text style={[styles.statusBannerText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        </View>

        {/* ── Booking Summary ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Summary</Text>

          <View style={styles.summaryRow}>
            <Ionicons name="flag-outline" size={16} color={Colors.dark.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Event</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>{booking.event?.name}</Text>
            </View>
          </View>

          {dateStart && (
            <View style={styles.summaryRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.dark.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>Date</Text>
                <Text style={styles.summaryValue}>
                  {dateStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.summaryRow}>
            <Ionicons name={isCreator ? 'car-sport-outline' : 'camera-outline'} size={16} color={Colors.dark.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>{isCreator ? 'Driver' : 'Creator'}</Text>
              <Pressable onPress={() => router.push(`/profile/${otherUser?.id}`)}>
                <Text style={[styles.summaryValue, styles.linkText]}>{otherUser?.displayName}</Text>
              </Pressable>
            </View>
          </View>

          {booking.pkg && (
            <View style={styles.summaryRow}>
              <Ionicons name="pricetag-outline" size={16} color={Colors.dark.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>Package</Text>
                <Text style={styles.summaryValue}>{booking.pkg.title}</Text>
              </View>
            </View>
          )}

          {booking.notes ? (
            <View style={styles.summaryRow}>
              <Ionicons name="document-text-outline" size={16} color={Colors.dark.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>Notes</Text>
                <Text style={styles.summaryValue}>{booking.notes}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Payment Clarity ─────────────────────────────────────────────────── */}
        {booking.status === 'requested' && isDriver && (
          <View style={styles.paymentClarityBanner}>
            <Ionicons name="shield-checkmark-outline" size={18} color={Colors.dark.success} />
            <Text style={styles.paymentClarityText}>
              You will not be charged until the creator accepts your request.
            </Text>
          </View>
        )}

        {/* ── Payment Summary ──────────────────────────────────────────────────── */}
        {hasPaymentSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Summary</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Package price</Text>
              <Text style={styles.paymentValue}>${packagePrice!.toFixed(2)}</Text>
            </View>
            {platformFee !== null && (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{PLATFORM_FEE_LABEL}</Text>
                <Text style={[styles.paymentValue, { color: Colors.dark.textMuted }]}>-${platformFee.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.paymentDivider} />
            {creatorPayout !== null && (
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { fontFamily: fonts.semiBold, color: Colors.dark.text }]}>Creator receives</Text>
                <Text style={[styles.paymentValue, { fontFamily: fonts.bold, color: Colors.dark.success }]}>${creatorPayout.toFixed(2)}</Text>
              </View>
            )}
            {['requested', 'accepted', 'payment_pending'].includes(booking.status) && (
              <View style={styles.paymentPendingNote}>
                <Ionicons name="time-outline" size={14} color={Colors.dark.warning} />
                <Text style={styles.paymentPendingNoteText}>Payment is required after the booking is accepted.</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Delivery Section ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deliveries</Text>
            {canAddDelivery && (
              <Pressable
                onPress={() => setShowDeliveryModal(true)}
                style={styles.addDeliveryBtn}
              >
                <Ionicons name="add" size={18} color={Colors.dark.primary} />
                <Text style={styles.addDeliveryText}>Add</Text>
              </Pressable>
            )}
          </View>

          {deliveries.length === 0 ? (
            <Text style={styles.emptyDelivery}>
              {canAddDelivery
                ? 'Add a delivery link or file to share your work with the driver.'
                : 'No deliveries yet.'}
            </Text>
          ) : (
            deliveries.map((d: any) => (
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
            ))
          )}
        </View>

        {/* ── Message & Status Actions ──────────────────────────────────────────── */}
        <View style={styles.actionsSection}>
          {/* Message button */}
          <Pressable
            onPress={() => router.push(`/chat/${otherUser?.id}`)}
            style={styles.messageBtn}
          >
            <Ionicons name="chatbubble-outline" size={18} color={Colors.dark.textSecondary} />
            <Text style={styles.messageBtnText}>Message {isCreator ? 'Driver' : 'Creator'}</Text>
          </Pressable>

          {/* Creator actions */}
          {canCreatorAct && booking.status === 'requested' && (
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => statusMutation.mutate('accepted')}
                style={[styles.actionBtn, styles.acceptBtn]}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="checkmark" size={18} color={Colors.dark.success} />
                <Text style={[styles.actionBtnText, { color: Colors.dark.success }]}>Accept</Text>
              </Pressable>
              <Pressable
                onPress={() => statusMutation.mutate('declined')}
                style={[styles.actionBtn, styles.declineBtn]}
                disabled={statusMutation.isPending}
              >
                <Ionicons name="close" size={18} color={Colors.dark.error} />
                <Text style={[styles.actionBtnText, { color: Colors.dark.error }]}>Decline</Text>
              </Pressable>
            </View>
          )}
          {/* Driver: Pay Now button — accepted or payment_pending */}
          {isDriver && ['accepted', 'payment_pending'].includes(booking.status) && (
            <Pressable
              onPress={handlePayNow}
              style={[styles.fullActionBtn, { backgroundColor: Colors.dark.primary }]}
              disabled={payNowLoading}
            >
              {payNowLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={18} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: '#fff', fontFamily: fonts.bold }]}>Pay Now</Text>
                </>
              )}
            </Pressable>
          )}

          {/* Creator: waiting for payment nudge */}
          {isCreator && ['accepted', 'payment_pending'].includes(booking.status) && (
            <View style={[styles.fullActionBtn, { backgroundColor: Colors.dark.warningMuted, opacity: 0.9 }]}>
              <Ionicons name="hourglass-outline" size={18} color={Colors.dark.warning} />
              <Text style={[styles.actionBtnText, { color: Colors.dark.warning }]}>Waiting for driver payment</Text>
            </View>
          )}
          {canCreatorAct && booking.status === 'in_progress' && (
            <Pressable
              onPress={() => statusMutation.mutate('footage_delivered')}
              style={[styles.fullActionBtn, { backgroundColor: Colors.dark.accentMuted }]}
              disabled={statusMutation.isPending}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.dark.accent} />
              <Text style={[styles.actionBtnText, { color: Colors.dark.accent }]}>Mark Footage Delivered</Text>
            </Pressable>
          )}
          {canCreatorAct && booking.status === 'footage_delivered' && (
            <Pressable
              onPress={() => statusMutation.mutate('completed')}
              style={[styles.fullActionBtn, { backgroundColor: Colors.dark.successMuted }]}
              disabled={statusMutation.isPending}
            >
              <Ionicons name="checkmark-done" size={18} color={Colors.dark.success} />
              <Text style={[styles.actionBtnText, { color: Colors.dark.success }]}>Mark Completed</Text>
            </Pressable>
          )}

          {/* Driver actions */}
          {canDriverCancel && (
            <Pressable
              onPress={() => {
                Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking request?', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel Booking', style: 'destructive', onPress: () => statusMutation.mutate('cancelled') },
                ]);
              }}
              style={[styles.fullActionBtn, { backgroundColor: Colors.dark.errorMuted }]}
              disabled={statusMutation.isPending}
            >
              <Ionicons name="close-circle-outline" size={18} color={Colors.dark.error} />
              <Text style={[styles.actionBtnText, { color: Colors.dark.error }]}>Cancel Request</Text>
            </Pressable>
          )}
        </View>

        <View style={{ height: Math.max(insets.bottom, webBottomInset) + 40 }} />
      </ScrollView>

      {/* ── Add Delivery Modal ─────────────────────────────────────────────── */}
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

      {/* ── Request Revision Modal ─────────────────────────────────────────── */}
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

function DeliveryItem({ delivery, isDriver, onApprove, onRequestRevision }: {
  delivery: any;
  isDriver: boolean;
  onApprove: () => void;
  onRequestRevision: () => void;
}) {
  const DELIVERY_STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
    pending:             { bg: Colors.dark.warningMuted, color: Colors.dark.warning, label: 'Pending' },
    uploaded:            { bg: Colors.dark.accentMuted, color: Colors.dark.accent, label: 'Uploaded' },
    delivered:           { bg: Colors.dark.accentMuted, color: Colors.dark.accent, label: 'Delivered' },
    revision_requested:  { bg: Colors.dark.errorMuted, color: Colors.dark.error, label: 'Revision Requested' },
    approved:            { bg: Colors.dark.successMuted, color: Colors.dark.success, label: 'Approved' },
  };

  const sm = DELIVERY_STATUS_META[delivery.status] || DELIVERY_STATUS_META.pending;
  const hasLink = !!delivery.externalLink;
  const isFootageReady = isDriver && delivery.status === 'delivered';

  return (
    <View style={[styles.deliveryCard, isFootageReady && styles.deliveryCardHighlight]}>
      {isFootageReady && (
        <View style={styles.footageReadyBanner}>
          <Ionicons name="film-outline" size={16} color={Colors.dark.primary} />
          <Text style={styles.footageReadyText}>Your footage is ready</Text>
        </View>
      )}

      <View style={styles.deliveryHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.deliveryTitle}>{delivery.title}</Text>
          <Text style={styles.deliveryType}>{DELIVERY_TYPE_LABELS[delivery.deliveryType] || 'Delivery'}</Text>
        </View>
        <View style={[styles.deliveryStatusBadge, { backgroundColor: sm.bg }]}>
          <Text style={[styles.deliveryStatusText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      {delivery.notes ? (
        <Text style={styles.deliveryNotes}>{delivery.notes}</Text>
      ) : null}

      {delivery.revisionNotes && delivery.status === 'revision_requested' ? (
        <View style={styles.revisionNoteBox}>
          <Ionicons name="alert-circle-outline" size={14} color={Colors.dark.error} />
          <Text style={styles.revisionNoteText}>{delivery.revisionNotes}</Text>
        </View>
      ) : null}

      <View style={styles.deliveryActions}>
        {hasLink && (
          <Pressable
            onPress={() => delivery.externalLink && Linking.openURL(delivery.externalLink)}
            style={styles.openLinkBtn}
          >
            <Ionicons name="open-outline" size={16} color={Colors.dark.primary} />
            <Text style={styles.openLinkText}>Open Link</Text>
          </Pressable>
        )}
        {isDriver && delivery.status === 'delivered' && (
          <View style={styles.deliveryDriverActions}>
            <Pressable onPress={onApprove} style={styles.approveCompleteBtn}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.approveCompleteBtnText}>Approve & Complete Booking</Text>
            </Pressable>
            <Pressable onPress={onRequestRevision} style={[styles.deliveryActionBtn, { backgroundColor: Colors.dark.errorMuted }]}>
              <Ionicons name="refresh-outline" size={16} color={Colors.dark.error} />
              <Text style={[styles.deliveryActionBtnText, { color: Colors.dark.error }]}>Request Revision</Text>
            </Pressable>
          </View>
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  errorText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textAlign: 'center',
  },
  statusBanner: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  statusBannerText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Section
  section: {
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  linkText: {
    color: Colors.dark.primary,
    fontFamily: fonts.medium,
  },
  // Payment
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  paymentValue: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  paymentDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: spacing.xs,
  },
  paymentClarityBanner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.sm,
    backgroundColor: Colors.dark.successMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  paymentClarityText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.success,
    lineHeight: 20,
  },
  paymentPendingNote: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  paymentPendingNoteText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.warning,
    flex: 1,
  },
  // Deliveries
  addDeliveryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: Colors.dark.primaryMuted,
  },
  addDeliveryText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  emptyDelivery: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  deliveryCard: {
    backgroundColor: Colors.dark.background,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: spacing.sm,
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  deliveryTitle: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
  },
  deliveryType: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  deliveryStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  deliveryStatusText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
  },
  deliveryNotes: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  revisionNoteBox: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: Colors.dark.errorMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
    alignItems: 'flex-start',
  },
  revisionNoteText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.error,
    flex: 1,
  },
  deliveryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  openLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: Colors.dark.primaryMuted,
  },
  openLinkText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: Colors.dark.primary,
  },
  deliveryCardHighlight: {
    borderColor: Colors.dark.primary,
    borderWidth: 1.5,
  },
  footageReadyBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    backgroundColor: Colors.dark.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    alignSelf: 'flex-start' as const,
  },
  footageReadyText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
  deliveryDriverActions: {
    flex: 1,
    gap: spacing.sm,
  },
  approveCompleteBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    backgroundColor: Colors.dark.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  approveCompleteBtnText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  deliveryActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  deliveryActionBtnText: {
    fontSize: 13,
    fontFamily: fonts.medium,
  },
  // Actions section
  actionsSection: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  messageBtnText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: Colors.dark.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  acceptBtn: {
    backgroundColor: Colors.dark.successMuted,
  },
  declineBtn: {
    backgroundColor: Colors.dark.errorMuted,
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
  },
  fullActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    marginBottom: spacing.xs,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  typeChipActive: {
    backgroundColor: Colors.dark.primaryMuted,
    borderColor: Colors.dark.primary,
  },
  typeChipText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  typeChipTextActive: {
    color: Colors.dark.primary,
  },
  modalInput: {
    backgroundColor: Colors.dark.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: Colors.dark.textMuted,
  },
  modalSubmitBtn: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: Colors.dark.primary,
  },
  modalSubmitText: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
});
