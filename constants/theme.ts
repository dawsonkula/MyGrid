import { Platform } from 'react-native';

// ─── Typography ──────────────────────────────────────────────────────────────
//
//  Space Grotesk      → headings, app name, event titles
//  Plus Jakarta Sans  → body, labels, UI copy
//  Barlow Condensed   → stats, prices, large numbers
//  DM Mono            → technical data (timestamps, IDs, coordinates)

export const fonts = {
  // Body / UI — Plus Jakarta Sans
  regular:       'PlusJakartaSans_400Regular',
  medium:        'PlusJakartaSans_500Medium',
  semiBold:      'PlusJakartaSans_600SemiBold',
  bold:          'PlusJakartaSans_700Bold',

  // Display / headings — Space Grotesk
  heading:       'SpaceGrotesk_600SemiBold',
  headingBold:   'SpaceGrotesk_700Bold',

  // Stats, prices, large numerics — Barlow Condensed
  condensed:     'BarlowCondensed_800ExtraBold',
  condensedBold: 'BarlowCondensed_900Black',

  // Technical / mono data — DM Mono
  mono:          'DMMono_400Regular',
};

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
};

// ─── Border radius ───────────────────────────────────────────────────────────
export const radius = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   20,
  full: 999,
};

// ─── Platform helpers ────────────────────────────────────────────────────────
export const webTopInset    = Platform.OS === 'web' ? 67 : 0;
export const webBottomInset = Platform.OS === 'web' ? 34 : 0;
