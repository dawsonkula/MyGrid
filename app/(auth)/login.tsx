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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, webTopInset) }]}>
      {/* Ambient glow */}
      <View style={styles.glowWrap} pointerEvents="none">
        <LinearGradient
          colors={['rgba(176,130,255,0.12)', 'transparent']}
          style={styles.glow}
        />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={Colors.dark.textSecondary} />
          </Pressable>

          {/* ── Brand ── */}
          <View style={styles.header}>
            <LinearGradient
              colors={['#B082FF', '#7040D0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoContainer}
            >
              <Ionicons name="grid" size={30} color="#fff" />
            </LinearGradient>
            <Text style={styles.wordmark}>MyGrid</Text>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          {/* ── Form ── */}
          <View style={styles.form}>
            {/* Email */}
            <View style={[
              styles.inputContainer,
              focusedField === 'email' && styles.inputContainerFocused,
            ]}>
              <Ionicons
                name="mail-outline"
                size={18}
                color={focusedField === 'email' ? Colors.dark.primary : Colors.dark.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.dark.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {/* Password */}
            <View style={[
              styles.inputContainer,
              focusedField === 'password' && styles.inputContainerFocused,
            ]}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={focusedField === 'password' ? Colors.dark.primary : Colors.dark.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={Colors.dark.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.dark.textMuted}
                />
              </Pressable>
            </View>

            {/* Error */}
            {!!error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={15} color={Colors.dark.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Sign In */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                loading && { opacity: 0.7 },
              ]}
            >
              <LinearGradient
                colors={['#B082FF', '#7040D0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.loginGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginText}>Sign In</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <Pressable onPress={() => router.replace('/(auth)/register')}>
              <Text style={styles.footerLink}>Sign Up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  glowWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 300,
  },
  glow: { flex: 1 },

  scrollContent: {
    flexGrow: 1, padding: spacing.xxl, justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute', top: 0, right: 0,
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },

  // Brand
  header: { alignItems: 'center', marginBottom: spacing.xxxl },
  logoContainer: {
    width: 68, height: 68, borderRadius: radius.lg + 2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  wordmark: {
    fontSize: 22, fontFamily: fonts.headingBold,
    color: Colors.dark.text, marginBottom: spacing.lg,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26, fontFamily: fonts.headingBold,
    color: Colors.dark.text, marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.textSecondary,
  },

  // Form
  form: { gap: spacing.md },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: Colors.dark.inputBorder,
    paddingHorizontal: spacing.lg, height: 52,
  },
  inputContainerFocused: {
    borderColor: Colors.dark.primary,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1, fontSize: 15, fontFamily: fonts.regular, color: Colors.dark.text,
  },
  eyeButton: { padding: spacing.xs },

  errorContainer: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.xs,
  },
  errorText: { fontSize: 13, fontFamily: fonts.regular, color: Colors.dark.error },

  loginButton: {
    marginTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden',
  },
  loginGradient: {
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  loginText: { fontSize: 16, fontFamily: fonts.semiBold, color: '#fff' },

  // Footer
  footer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: spacing.xs, marginTop: spacing.xxxl,
  },
  footerText: { fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.textSecondary },
  footerLink: { fontSize: 14, fontFamily: fonts.semiBold, color: Colors.dark.primary },
});
