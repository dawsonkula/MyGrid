// MyGrid brand color system
// Primary: #B082FF (violet)  Accent: #5EECC0 (mint)  Warning: #F0A030 (amber)

const Colors = {
  dark: {
    // Backgrounds
    background:        '#09090F',
    surface:           '#111116',
    surfaceElevated:   '#18181F',
    surfaceHighlight:  '#1E1E28',

    // Borders
    border:            '#222228',
    borderLight:       '#161619',

    // Text
    text:              '#F0EFF8',
    textSecondary:     '#888894',
    textMuted:         '#555560',

    // Brand primary — violet
    primary:           '#B082FF',
    primaryLight:      '#C8A3FF',
    primaryDark:       '#8B5FD6',
    primaryMuted:      'rgba(176, 130, 255, 0.15)',

    // Brand accent — mint
    accent:            '#5EECC0',
    accentMuted:       'rgba(94, 236, 192, 0.15)',

    // Semantic
    success:           '#5EECC0',
    successMuted:      'rgba(94, 236, 192, 0.15)',
    warning:           '#F0A030',
    warningMuted:      'rgba(240, 160, 48, 0.15)',
    error:             '#F05050',
    errorMuted:        'rgba(240, 80, 80, 0.15)',

    // UI utilities
    tint:              '#B082FF',
    tabIconDefault:    '#555560',
    tabIconSelected:   '#B082FF',
    skeleton:          '#18181F',
    overlay:           'rgba(0, 0, 0, 0.75)',

    // Cards / inputs
    card:              '#111116',
    cardBorder:        '#1E1E28',
    inputBackground:   '#111116',
    inputBorder:       '#222228',

    // Badges / status
    badge:             '#B082FF',
    statusAvailable:   '#5EECC0',
    statusLimited:     '#F0A030',
    statusBooked:      '#F05050',
  },

  // MyGrid is dark-only; light mirrors dark so theme switchers don't break
  light: {
    background:        '#09090F',
    surface:           '#111116',
    surfaceElevated:   '#18181F',
    surfaceHighlight:  '#1E1E28',
    border:            '#222228',
    borderLight:       '#161619',
    text:              '#F0EFF8',
    textSecondary:     '#888894',
    textMuted:         '#555560',
    primary:           '#B082FF',
    primaryLight:      '#C8A3FF',
    primaryDark:       '#8B5FD6',
    primaryMuted:      'rgba(176, 130, 255, 0.15)',
    accent:            '#5EECC0',
    accentMuted:       'rgba(94, 236, 192, 0.15)',
    success:           '#5EECC0',
    successMuted:      'rgba(94, 236, 192, 0.15)',
    warning:           '#F0A030',
    warningMuted:      'rgba(240, 160, 48, 0.15)',
    error:             '#F05050',
    errorMuted:        'rgba(240, 80, 80, 0.15)',
    tint:              '#B082FF',
    tabIconDefault:    '#555560',
    tabIconSelected:   '#B082FF',
    skeleton:          '#18181F',
    overlay:           'rgba(0, 0, 0, 0.75)',
    card:              '#111116',
    cardBorder:        '#1E1E28',
    inputBackground:   '#111116',
    inputBorder:       '#222228',
    badge:             '#B082FF',
    statusAvailable:   '#5EECC0',
    statusLimited:     '#F0A030',
    statusBooked:      '#F05050',
  },
};

export default Colors;
