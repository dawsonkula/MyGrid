import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset } from '@/constants/theme';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [primaryRole, setPrimaryRole] = useState<'driver' | 'creator' | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!displayName || !email || !password || !primaryRole) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        displayName: displayName.trim(),
        primaryRole: primaryRole as 'driver' | 'creator',
      });
      router.dismissAll();
      router.replace('/onboarding');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, webTopInset) }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
          </Pressable>

          <View style={styles.header}>
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryLight]}
              style={styles.logoContainer}
            >
              <Ionicons name="grid" size={32} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>Join MyGrid</Text>
            <Text style={styles.subtitle}>Connect with motorsports creators</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor={Colors.dark.textMuted}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.dark.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.dark.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password (min 6 characters)"
                placeholderTextColor={Colors.dark.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.dark.textMuted} />
              </Pressable>
            </View>

            <Text style={styles.roleLabel}>I am a...</Text>
            <View style={styles.roleRow}>
              <Pressable
                onPress={() => setPrimaryRole('driver')}
                style={[
                  styles.roleOption,
                  primaryRole === 'driver' && styles.roleSelected,
                ]}
              >
                <Ionicons
                  name="car-sport"
                  size={28}
                  color={primaryRole === 'driver' ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <Text style={[
                  styles.roleText,
                  primaryRole === 'driver' && styles.roleTextSelected,
                ]}>Driver</Text>
              </Pressable>
              <Pressable
                onPress={() => setPrimaryRole('creator')}
                style={[
                  styles.roleOption,
                  primaryRole === 'creator' && styles.roleSelected,
                ]}
              >
                <Ionicons
                  name="camera"
                  size={28}
                  color={primaryRole === 'creator' ? Colors.dark.primary : Colors.dark.textMuted}
                />
                <Text style={[
                  styles.roleText,
                  primaryRole === 'creator' && styles.roleTextSelected,
                ]}>Creator</Text>
              </Pressable>
            </View>

            {!!error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={Colors.dark.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleRegister}
              disabled={loading}
              style={({ pressed }) => [
                styles.registerButton,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                loading && { opacity: 0.7 },
              ]}
            >
              <LinearGradient
                colors={[Colors.dark.primary, Colors.dark.primaryDark]}
                style={styles.registerGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.registerText}>Create Account</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Pressable onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.footerLink}>Sign In</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xxl,
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: spacing.xxxl,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  form: {
    gap: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: Colors.dark.text,
  },
  eyeButton: {
    padding: spacing.xs,
  },
  roleLabel: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
    marginTop: spacing.sm,
  },
  roleRow: {
    flexDirection: 'row' as const,
    gap: spacing.md,
  },
  roleOption: {
    flex: 1,
    height: 88,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
  },
  roleSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primaryMuted,
  },
  roleText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textMuted,
  },
  roleTextSelected: {
    color: Colors.dark.primary,
  },
  errorContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  errorText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.error,
  },
  registerButton: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
  },
  registerGradient: {
    height: 52,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.md,
  },
  registerText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  footer: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.xxxl,
  },
  footerText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
  },
  footerLink: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: Colors.dark.primary,
  },
});
