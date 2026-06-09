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

  return (
    <View style={[styles.container, {
      paddingTop: Math.max(insets.top, webTopInset) + spacing.lg,
      paddingBottom: Math.max(insets.bottom, webBottomInset) + spacing.lg,
    }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.progressBar}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i <= step && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Tell us about yourself</Text>
              <Text style={styles.stepSubtitle}>
                {isCreator
                  ? 'Help drivers discover your work and style'
                  : 'Help media creators understand your needs'}
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[styles.textArea]}
                  placeholder={isCreator
                    ? 'Describe your work, style, and experience...'
                    : 'Tell us about your racing, car, and what you\'re looking for...'}
                  placeholderTextColor={Colors.dark.textMuted}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              {!isCreator && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Car Info</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g., 2023 Porsche 911 GT3 RS"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={carInfo}
                    onChangeText={setCarInfo}
                  />
                </View>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Location</Text>
                <TextInput
                  style={styles.inputField}
                  placeholder="e.g., Austin, TX"
                  placeholderTextColor={Colors.dark.textMuted}
                  value={location}
                  onChangeText={setLocation}
                />
              </View>
            </View>
          )}

          {step === 1 && isCreator && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Your Specialty</Text>
              <Text style={styles.stepSubtitle}>Select your media types</Text>

              <View style={styles.mediaTypeGrid}>
                {MEDIA_TYPE_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    onPress={() => toggleMediaType(opt.value)}
                    style={[
                      styles.mediaTypeCard,
                      selectedMediaTypes.includes(opt.value) && styles.mediaTypeSelected,
                    ]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={28}
                      color={selectedMediaTypes.includes(opt.value) ? Colors.dark.primary : Colors.dark.textMuted}
                    />
                    <Text style={[
                      styles.mediaTypeLabel,
                      selectedMediaTypes.includes(opt.value) && styles.mediaTypeLabelSelected,
                    ]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={() => setTravelAvailable(!travelAvailable)}
                style={styles.toggleRow}
              >
                <View style={styles.toggleInfo}>
                  <Ionicons name="airplane-outline" size={20} color={Colors.dark.textSecondary} />
                  <Text style={styles.toggleLabel}>Available to travel</Text>
                </View>
                <View style={[
                  styles.toggle,
                  travelAvailable && styles.toggleActive,
                ]}>
                  <View style={[
                    styles.toggleThumb,
                    travelAvailable && styles.toggleThumbActive,
                  ]} />
                </View>
              </Pressable>
            </View>
          )}

          {((step === 1 && !isCreator) || (step === 2 && isCreator)) && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Social Links</Text>
              <Text style={styles.stepSubtitle}>Connect your social profiles (optional)</Text>

              <View style={styles.fieldGroup}>
                <View style={styles.socialInputRow}>
                  <Ionicons name="logo-instagram" size={22} color="#E1306C" />
                  <TextInput
                    style={styles.socialInput}
                    placeholder="Instagram username"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={instagram}
                    onChangeText={setInstagram}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.socialInputRow}>
                  <Ionicons name="logo-youtube" size={22} color="#FF0000" />
                  <TextInput
                    style={styles.socialInput}
                    placeholder="YouTube channel"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={youtube}
                    onChangeText={setYoutube}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.socialInputRow}>
                  <Ionicons name="logo-tiktok" size={22} color={Colors.dark.text} />
                  <TextInput
                    style={styles.socialInput}
                    placeholder="TikTok username"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={tiktok}
                    onChangeText={setTiktok}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

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
              pressed && { opacity: 0.9 },
              (!canProceed() || loading) && { opacity: 0.5 },
            ]}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
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
    flex: 1,
    backgroundColor: Colors.dark.background,
    paddingHorizontal: spacing.xxl,
  },
  progressBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  progressDot: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: Colors.dark.primary,
  },
  scrollContent: {
    flexGrow: 1,
  },
  stepContent: {
    gap: spacing.xl,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  stepSubtitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    marginTop: -spacing.md,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  inputField: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg,
    height: 48,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
  },
  textArea: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    minHeight: 100,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
  },
  mediaTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  mediaTypeCard: {
    width: '47%',
    height: 88,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  mediaTypeSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primaryMuted,
  },
  mediaTypeLabel: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
  },
  mediaTypeLabelSelected: {
    color: Colors.dark.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: Colors.dark.text,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: Colors.dark.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  socialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg,
    height: 48,
    gap: spacing.sm,
  },
  socialInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  backButton: {
    width: 48,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  nextGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  nextText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
});
