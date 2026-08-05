import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { apiRequest, queryClient } from '@/lib/query-client';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

const MEDIA_TYPE_OPTIONS = [
  { value: 'photographer', label: 'Photographer', icon: 'camera' },
  { value: 'videographer', label: 'Videographer', icon: 'videocam' },
  { value: 'drone', label: 'Drone Pilot', icon: 'airplane' },
  { value: 'social_content', label: 'Social Content', icon: 'share-social' },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { user, refetchUser } = useAuth();
  const [step, setStep] = useState(0);
  const [bio, setBio] = useState('');
  const [carInfo, setCarInfo] = useState('');
  const [location, setLocation] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [selectedMediaTypes, setSelectedMediaTypes] = useState<string[]>([]);
  const [travelAvailable, setTravelAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const isCreator = user?.primaryRole === 'creator';
  const totalSteps = isCreator ? 3 : 2;

  const toggleMediaType = (type: string) => {
    setSelectedMediaTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const socialLinks = JSON.stringify({
        instagram: instagram.trim(),
        youtube: youtube.trim(),
        tiktok: tiktok.trim(),
      });
      await apiRequest('PUT', '/api/profile', {
        bio: bio.trim(),
        carInfo: carInfo.trim(),
        location: location.trim(),
        socialLinks,
        mediaTypes: selectedMediaTypes.join(','),
        travelAvailable,
        onboardingComplete: true,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      refetchUser();
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Onboarding error:', err);
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return bio.trim().length > 0;
    if (step === 1 && isCreator) return selectedMediaTypes.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const stepIcons = isCreator
    ? ['person-outline', 'camera-outline', 'share-social-outline']
    : ['person-outline', 'share-social-outline'];

  return (
    <View style={[styles.container, {
      paddingTop: Math.max(insets.top, webTopInset) + spacing.lg,
      paddingBottom: Math.max(insets.bottom, webBottomInset) + spacing.lg,
    }]}>
      {/* Ambient glow */}
      <View style={styles.glowWrap} pointerEvents="none">
        <LinearGradient
          colors={['rgba(176,130,255,0.10)', 'transparent']}
          style={styles.glow}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* ── Progress bar ── */}
        <View style={styles.progressBar}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View key={i} style={styles.progressSegmentWrap}>
              {i <= step ? (
                <LinearGradient
                  colors={['#B082FF', '#7040D0']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressSegment}
                />
              ) : (
                <View style={[styles.progressSegment, styles.progressSegmentInactive]} />
              )}
            </View>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 0: About you ── */}
          {step === 0 && (
            <View style={styles.stepContent}>
              <View style={styles.stepHeader}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name="person-outline" size={22} color={Colors.dark.primary} />
                </View>
                <Text style={styles.stepTitle}>Tell us about yourself</Text>
                <Text style={styles.stepSubtitle}>
                  {isCreator
                    ? 'Help drivers discover your work and style'
                    : 'Help media creators understand your needs'}
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    focusedField === 'bio' && styles.inputFocused,
                  ]}
                  placeholder={isCreator
                    ? 'Describe your work, style, and experience...'
                    : "Tell us about your racing, car, and what you're looking for..."}
                  placeholderTextColor={Colors.dark.textMuted}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  onFocus={() => setFocusedField('bio')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>

              {!isCreator && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Car Info</Text>
                  <TextInput
                    style={[
                      styles.inputField,
                      focusedField === 'car' && styles.inputFocused,
                    ]}
                    placeholder="e.g., 2023 Porsche 911 GT3 RS"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={carInfo}
                    onChangeText={setCarInfo}
                    onFocus={() => setFocusedField('car')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Location</Text>
                <TextInput
                  style={[
                    styles.inputField,
                    focusedField === 'location' && styles.inputFocused,
                  ]}
                  placeholder="e.g., Austin, TX"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={location}
                  onChangeText={setLocation}
                  onFocus={() => setFocusedField('location')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>
          )}

          {/* ── Step 1 (creator): Specialty ── */}
          {step === 1 && isCreator && (
            <View style={styles.stepContent}>
              <View style={styles.stepHeader}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name="camera-outline" size={22} color={Colors.dark.primary} />
                </View>
                <Text style={styles.stepTitle}>Your Specialty</Text>
                <Text style={styles.stepSubtitle}>Select all that apply</Text>
              </View>

              <View style={styles.mediaTypeGrid}>
                {MEDIA_TYPE_OPTIONS.map(opt => {
                  const selected = selectedMediaTypes.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => toggleMediaType(opt.value)}
                      style={[styles.mediaTypeCard, selected && styles.mediaTypeSelected]}
                    >
                      {selected && (
                        <LinearGradient
                          colors={['rgba(176,130,255,0.15)', 'rgba(112,64,208,0.10)']}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <Ionicons
                        name={opt.icon as any}
                        size={26}
                        color={selected ? Colors.dark.primary : Colors.dark.textMuted}
                      />
                      <Text style={[styles.mediaTypeLabel, selected && styles.mediaTypeLabelSelected]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => setTravelAvailable(!travelAvailable)}
                style={[styles.toggleRow, travelAvailable && styles.toggleRowActive]}
              >
                <View style={styles.toggleInfo}>
                  <Ionicons
                    name="airplane-outline"
                    size={20}
                    color={travelAvailable ? Colors.dark.primary : Colors.dark.textSecondary}
                  />
                  <Text style={[styles.toggleLabel, travelAvailable && styles.toggleLabelActive]}>
                    Available to travel
                  </Text>
                </View>
                <View style={[styles.toggle, travelAvailable && styles.toggleActive]}>
                  <View style={[styles.toggleThumb, travelAvailable && styles.toggleThumbActive]} />
                </View>
              </Pressable>
            </View>
          )}

          {/* ── Social links step ── */}
          {((step === 1 && !isCreator) || (step === 2 && isCreator)) && (
            <View style={styles.stepContent}>
              <View style={styles.stepHeader}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name="share-social-outline" size={22} color={Colors.dark.primary} />
                </View>
                <Text style={styles.stepTitle}>Social Links</Text>
                <Text style={styles.stepSubtitle}>Connect your profiles (optional)</Text>
              </View>

              <View style={styles.fieldGroup}>
                <View style={[
                  styles.socialInputRow,
                  focusedField === 'instagram' && styles.inputFocused,
                ]}>
                  <Ionicons name="logo-instagram" size={20} color="#E1306C" />
                  <TextInput
                    style={styles.socialInput}
                    placeholder="Instagram username"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={instagram}
                    onChangeText={setInstagram}
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('instagram')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <View style={[
                  styles.socialInputRow,
                  focusedField === 'youtube' && styles.inputFocused,
                ]}>
                  <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                  <TextInput
                    style={styles.socialInput}
                    placeholder="YouTube channel"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={youtube}
                    onChangeText={setYoutube}
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('youtube')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <View style={[
                  styles.socialInputRow,
                  focusedField === 'tiktok' && styles.inputFocused,
                ]}>
                  <Ionicons name="logo-tiktok" size={20} color={Colors.dark.text} />
                  <TextInput
                    style={styles.socialInput}
                    placeholder="TikTok username"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={tiktok}
                    onChangeText={setTiktok}
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('tiktok')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Bottom actions ── */}
        <View style={styles.bottomActions}>
          {step > 0 && (
            <Pressable onPress={() => setStep(step - 1)} style={styles.backButton}>
              <Ionicons name="chevron-back" size={20} color={Colors.dark.textSecondary} />
            </Pressable>
          )}
          <Pressable
            onPress={handleNext}
            disabled={loading || !canProceed()}
            style={({ pressed }) => [
              styles.nextButton,
              { flex: step > 0 ? 1 : undefined },
              pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
              (!canProceed() || loading) && { opacity: 0.45 },
            ]}
          >
            <LinearGradient
              colors={['#B082FF', '#7040D0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.nextGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.nextText}>
                  {step === totalSteps - 1 ? 'Complete Setup' : 'Continue'}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.dark.background,
    paddingHorizontal: spacing.xxl,
  },

  glowWrap: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  glow: { flex: 1 },

  // Progress
  progressBar: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xxl },
  progressSegmentWrap: { flex: 1 },
  progressSegment: { height: 3, borderRadius: 2 },
  progressSegmentInactive: { backgroundColor: Colors.dark.border },

  scrollContent: { flexGrow: 1 },

  // Step
  stepContent: { gap: spacing.xl },
  stepHeader: { gap: spacing.xs },
  stepIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stepTitle: {
    fontSize: 26, fontFamily: fonts.headingBold, color: Colors.dark.text,
  },
  stepSubtitle: {
    fontSize: 15, fontFamily: fonts.regular, color: Colors.dark.textSecondary,
  },

  // Fields
  fieldGroup: { gap: spacing.sm },
  label: {
    fontSize: 11, fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  inputField: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg,
    height: 50,
    fontSize: 15, fontFamily: fonts.regular, color: Colors.dark.text,
  },
  textArea: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.md,
    minHeight: 100,
    fontSize: 15, fontFamily: fonts.regular, color: Colors.dark.text,
  },
  inputFocused: {
    borderColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },

  // Media types
  mediaTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  mediaTypeCard: {
    width: '47%', height: 84,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, overflow: 'hidden',
  },
  mediaTypeSelected: { borderColor: Colors.dark.primary },
  mediaTypeLabel: { fontSize: 13, fontFamily: fonts.semiBold, color: Colors.dark.textMuted },
  mediaTypeLabelSelected: { color: Colors.dark.primary },

  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  toggleRowActive: { borderColor: Colors.dark.primary },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleLabel: { fontSize: 15, fontFamily: fonts.medium, color: Colors.dark.text },
  toggleLabelActive: { color: Colors.dark.primary },
  toggle: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: Colors.dark.border,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleActive: { backgroundColor: Colors.dark.primary },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
  },
  toggleThumbActive: { alignSelf: 'flex-end' },

  // Social
  socialInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg, height: 50,
    gap: spacing.sm,
  },
  socialInput: {
    flex: 1, fontSize: 15, fontFamily: fonts.regular, color: Colors.dark.text,
  },

  // Bottom
  bottomActions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.lg },
  backButton: {
    width: 52, height: 52, borderRadius: radius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    alignItems: 'center', justifyContent: 'center',
  },
  nextButton: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  nextGradient: { height: 52, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontSize: 16, fontFamily: fonts.semiBold, color: '#fff' },
});
