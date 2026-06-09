import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQueryFn, apiRequest, queryClient } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

type Step = 'form' | 'review';

export default function CreateBookingScreen() {
  const { creatorId, eventId, packageId } = useLocalSearchParams<{ creatorId?: string; eventId?: string; packageId?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('form');
  const [selectedEventId, setSelectedEventId] = useState(eventId || '');
  const [selectedPackageId, setSelectedPackageId] = useState(packageId || '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: creator } = useQuery<any>({
    queryKey: ['/api/users', creatorId],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!creatorId,
  });

  const { data: packages = [] } = useQuery<any[]>({
    queryKey: ['/api/packages', creatorId],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!creatorId,
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ['/api/events'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const selectedEvent = events.find((e: any) => e.id === selectedEventId);
  const selectedPkg = packages.find((p: any) => p.id === selectedPackageId);

  // Find most expensive package to tag as POPULAR
  const popularPkgId = packages.length > 1
    ? packages.reduce((a: any, b: any) => parseFloat(a.price) >= parseFloat(b.price) ? a : b)?.id
    : null;

  const feeCalc = (() => {
    if (!selectedPkg) return null;
    const gross = parseFloat(selectedPkg.price);
    if (isNaN(gross) || gross <= 0) return null;
    const fee = parseFloat((gross * 0.10).toFixed(2));
    const total = parseFloat((gross + fee).toFixed(2));
    const payout = parseFloat((gross - fee).toFixed(2));
    return { gross, fee, total, payout };
  })();

  const handleContinueToReview = () => {
    if (!selectedEventId) { setError('Please select an event'); return; }
    if (!creatorId) { setError('No creator selected'); return; }
    setError('');
    setStep('review');
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      await apiRequest('POST', '/api/bookings', {
        creatorId,
        eventId: selectedEventId,
        packageId: selectedPackageId || undefined,
        notes: notes.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      router.back();
    } catch (err: any) {
      setError(err.message || 'Failed to create booking');
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;
  const bottomPadding = Math.max(insets.bottom, webBottomInset) + spacing.md;

  // ─── REVIEW STEP ──────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
          <Pressable onPress={() => setStep('form')} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.textSecondary} />
          </Pressable>
          <Text style={styles.headerText}>Review Request</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Summary card */}
          <View style={styles.reviewCard}>
            <Text style={styles.sectionLabel}>Booking Summary</Text>

            <View style={styles.reviewRow}>
              <Ionicons name="person-outline" size={15} color={Colors.dark.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewRowLabel}>Creator</Text>
                <Text style={styles.reviewRowValue}>{creator?.displayName || '—'}</Text>
              </View>
            </View>

            <View style={styles.reviewRow}>
              <Ionicons name="flag-outline" size={15} color={Colors.dark.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewRowLabel}>Event</Text>
                <Text style={styles.reviewRowValue} numberOfLines={2}>{selectedEvent?.name || '—'}</Text>
              </View>
            </View>

            {selectedEvent?.dateStart && (
              <View style={styles.reviewRow}>
                <Ionicons name="calendar-outline" size={15} color={Colors.dark.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewRowLabel}>Date</Text>
                  <Text style={styles.reviewRowValue}>
                    {new Date(selectedEvent.dateStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </View>
            )}

            {selectedPkg && (
              <View style={styles.reviewRow}>
                <Ionicons name="pricetag-outline" size={15} color={Colors.dark.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewRowLabel}>Package</Text>
                  <Text style={styles.reviewRowValue}>{selectedPkg.title}</Text>
                  {selectedPkg.description ? (
                    <Text style={styles.reviewRowSub} numberOfLines={2}>{selectedPkg.description}</Text>
                  ) : null}
                </View>
              </View>
            )}

            {notes.trim() ? (
              <View style={styles.reviewRow}>
                <Ionicons name="document-text-outline" size={15} color={Colors.dark.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewRowLabel}>Notes</Text>
                  <Text style={styles.reviewRowValue}>{notes}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Fee breakdown */}
          {feeCalc && (
            <View style={styles.feeCard}>
              <Text style={styles.sectionLabel}>Pricing Breakdown</Text>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Package price</Text>
                <Text style={styles.feeValue}>${feeCalc.gross.toFixed(2)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Platform fee (10%)</Text>
                <Text style={[styles.feeValue, { color: Colors.dark.textMuted }]}>+${feeCalc.fee.toFixed(2)}</Text>
              </View>
              <View style={styles.feeDivider} />
              <View style={[styles.feeRow, { alignItems: 'baseline' }]}>
                <Text style={[styles.feeLabel, { fontFamily: fonts.semiBold, color: Colors.dark.text }]}>Total due</Text>
                <Text style={styles.feeTotalLarge}>${feeCalc.total.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Info banners */}
          <View style={styles.infoBanner}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.dark.success} />
            <Text style={styles.infoBannerText}>You won't be charged until the creator accepts your request.</Text>
          </View>

          {!!error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={Colors.dark.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: bottomPadding }]}>
          <Pressable
            onPress={handleCreate}
            disabled={loading}
            style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
          >
            <LinearGradient colors={[Colors.dark.primary, Colors.dark.primaryDark]} style={styles.primaryBtnGradient}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send Booking Request</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => setStep('form')} style={styles.ghostBtn}>
            <Text style={styles.ghostBtnText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── FORM STEP ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
        </Pressable>
        <Text style={styles.headerText}>Book Creator</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Creator info strip */}
          {creator && (
            <View style={styles.creatorStrip}>
              <View style={styles.creatorStripAvatar}>
                <Text style={styles.creatorStripAvatarText}>{(creator.displayName || '?')[0].toUpperCase()}</Text>
              </View>
              <View>
                <Text style={styles.creatorStripName}>{creator.displayName}</Text>
                <Text style={styles.creatorStripRole}>Media Creator</Text>
              </View>
            </View>
          )}

          {/* Event selection */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Select Event</Text>
            {events.map((evt: any) => (
              <Pressable
                key={evt.id}
                onPress={() => setSelectedEventId(evt.id)}
                style={[styles.optionCard, selectedEventId === evt.id && styles.optionCardSelected]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionTitle, selectedEventId === evt.id && { color: Colors.dark.text }]}>{evt.name}</Text>
                  <Text style={styles.optionSub}>{evt.location}</Text>
                </View>
                {selectedEventId === evt.id && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
                )}
              </Pressable>
            ))}
          </View>

          {/* Package selection */}
          {packages.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Select Package</Text>
              {packages.map((pkg: any) => {
                const isSelected = selectedPackageId === pkg.id;
                const isPopular = pkg.id === popularPkgId;
                const price = parseFloat(pkg.price);
                return (
                  <Pressable
                    key={pkg.id}
                    onPress={() => setSelectedPackageId(isSelected ? '' : pkg.id)}
                    style={[styles.pkgCard, isSelected && styles.pkgCardSelected]}
                  >
                    {isPopular && (
                      <View style={styles.popularBadge}>
                        <Text style={styles.popularBadgeText}>POPULAR</Text>
                      </View>
                    )}
                    <View style={styles.pkgCardInner}>
                      <View style={[styles.pkgRadio, isSelected && styles.pkgRadioSelected]}>
                        {isSelected && <Text style={styles.pkgRadioCheck}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pkgTitle, isSelected && { color: Colors.dark.text }]}>{pkg.title}</Text>
                        {pkg.description ? (
                          <Text style={styles.pkgDesc} numberOfLines={2}>{pkg.description}</Text>
                        ) : null}
                      </View>
                      {!isNaN(price) && price > 0 ? (
                        <Text style={[styles.pkgPrice, isSelected && { color: Colors.dark.primary }]}>
                          ${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Price breakdown */}
          {feeCalc && (
            <View style={styles.feeCard}>
              <Text style={styles.sectionLabel}>Booking Summary</Text>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Package</Text>
                <Text style={styles.feeValue}>${feeCalc.gross.toFixed(2)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Platform fee (10%)</Text>
                <Text style={[styles.feeValue, { color: Colors.dark.textMuted }]}>+${feeCalc.fee.toFixed(2)}</Text>
              </View>
              <View style={styles.feeDivider} />
              <View style={[styles.feeRow, { alignItems: 'baseline' }]}>
                <Text style={[styles.feeLabel, { fontFamily: fonts.semiBold, color: Colors.dark.text }]}>Total</Text>
                <Text style={styles.feeTotalLarge}>${feeCalc.total.toFixed(2)}</Text>
              </View>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Creator receives</Text>
                <Text style={[styles.feeValue, { color: Colors.dark.success }]}>${feeCalc.payout.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Notes */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Notes to creator (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Any specific requirements, car number, coverage details..."
              placeholderTextColor={Colors.dark.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />
          </View>

          {!!error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={Colors.dark.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: bottomPadding }]}>
          <Pressable onPress={handleContinueToReview} style={styles.primaryBtn}>
            <LinearGradient colors={[Colors.dark.primary, Colors.dark.primaryDark]} style={styles.primaryBtnGradient}>
              <Text style={styles.primaryBtnText}>Review Booking</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </LinearGradient>
          </Pressable>
          <View style={styles.trustRow}>
            <Ionicons name="lock-closed-outline" size={13} color={Colors.dark.textMuted} />
            <Text style={styles.trustText}>Secured by Stripe · Held until delivery confirmed</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerText: { fontSize: 18, fontFamily: fonts.headingBold, color: Colors.dark.text },

  scrollContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },

  // Creator strip
  creatorStrip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: Colors.dark.surface, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.xxl,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  creatorStripAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.dark.primaryMuted, alignItems: 'center', justifyContent: 'center',
  },
  creatorStripAvatarText: { fontSize: 16, fontFamily: fonts.bold, color: Colors.dark.primary },
  creatorStripName: { fontSize: 16, fontFamily: fonts.semiBold, color: Colors.dark.text },
  creatorStripRole: { fontSize: 12, fontFamily: fonts.regular, color: Colors.dark.textMuted },

  // Fields
  field: { marginBottom: spacing.xxl },
  fieldLabel: {
    fontSize: 11, fontFamily: fonts.semiBold, color: Colors.dark.textMuted,
    marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sectionLabel: {
    fontSize: 11, fontFamily: fonts.semiBold, color: Colors.dark.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.md,
  },

  // Event option cards
  optionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.surface, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.sm,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    gap: spacing.md,
  },
  optionCardSelected: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primaryMuted },
  optionTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: Colors.dark.textSecondary },
  optionSub: { fontSize: 12, fontFamily: fonts.regular, color: Colors.dark.textMuted, marginTop: 2 },

  // Package cards
  pkgCard: {
    backgroundColor: Colors.dark.surface, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    marginBottom: spacing.sm, overflow: 'hidden',
  },
  pkgCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primaryMuted,
  },
  popularBadge: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderRadius: 0,
    borderBottomRightRadius: radius.sm,
  },
  popularBadgeText: {
    fontSize: 9, fontFamily: fonts.bold, color: Colors.dark.background,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  pkgCardInner: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  pkgRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pkgRadioSelected: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  pkgRadioCheck: { fontSize: 11, color: Colors.dark.background, fontFamily: fonts.bold },
  pkgTitle: { fontSize: 14, fontFamily: fonts.semiBold, color: Colors.dark.textSecondary },
  pkgDesc: { fontSize: 11, fontFamily: fonts.regular, color: Colors.dark.textMuted, marginTop: 3, lineHeight: 16 },
  pkgPrice: { fontSize: 26, fontFamily: fonts.condensedBold, color: Colors.dark.textSecondary, flexShrink: 0 },

  // Fee breakdown card
  feeCard: {
    backgroundColor: Colors.dark.surface, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.xxl,
    borderWidth: 1, borderColor: Colors.dark.border,
    gap: spacing.sm,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feeLabel: { fontSize: 13, fontFamily: fonts.regular, color: Colors.dark.textSecondary },
  feeValue: { fontSize: 14, fontFamily: fonts.semiBold, color: Colors.dark.text },
  feeTotalLarge: { fontSize: 32, fontFamily: fonts.condensedBold, color: Colors.dark.text, lineHeight: 36 },
  feeDivider: { height: 1, backgroundColor: Colors.dark.border, marginVertical: spacing.xs },

  // Notes
  notesInput: {
    backgroundColor: Colors.dark.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    minHeight: 90, fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.text,
    lineHeight: 22,
  },

  // Info/error
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: Colors.dark.successMuted, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  infoBannerText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: Colors.dark.success, lineHeight: 19 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  errorText: { fontSize: 13, fontFamily: fonts.regular, color: Colors.dark.error },

  // Bottom bar
  bottomBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  primaryBtn: { borderRadius: radius.md, overflow: 'hidden' },
  primaryBtnGradient: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md,
  },
  primaryBtnText: { fontSize: 16, fontFamily: fonts.semiBold, color: '#fff' },
  ghostBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  ghostBtnText: { fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.textMuted },
  trustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  trustText: { fontSize: 11, fontFamily: fonts.regular, color: Colors.dark.textMuted },

  // Review step
  reviewCard: {
    backgroundColor: Colors.dark.surface, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: Colors.dark.border,
    gap: spacing.md,
  },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  reviewRowLabel: { fontSize: 11, fontFamily: fonts.regular, color: Colors.dark.textMuted, marginBottom: 2 },
  reviewRowValue: { fontSize: 15, fontFamily: fonts.semiBold, color: Colors.dark.text },
  reviewRowSub: { fontSize: 12, fontFamily: fonts.regular, color: Colors.dark.textSecondary, marginTop: 2 },
});
