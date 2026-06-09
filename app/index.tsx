import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, FlatList, Platform, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth-context';
import { getApiUrl } from '@/lib/query-client';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

interface EventItem {
  id: number;
  name: string;
  host?: string;
  location: string;
  venue?: string;
  eventType?: string;
  dateStart?: string;
  dateEnd?: string;
  bannerImage?: string;
  isFeatured?: boolean;
  date?: string;
}

const DEFAULT_EVENT_IMAGE = '/uploads/event_placeholder.png';

function getEventImageUrl(bannerImage?: string): string {
  const img = bannerImage || DEFAULT_EVENT_IMAGE;
  if (img.startsWith('http')) return img;
  return `${getApiUrl()}${img}`;
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  React.useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (!user.onboardingComplete) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isLoading, user]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const baseUrl = getApiUrl();
        const url = new URL('/api/events', baseUrl);
        const res = await fetch(url.toString());
        if (res.ok) {
          const data: EventItem[] = await res.json();
          // Prefer featured events for the landing carousel; fall back to first 5
          const featured = data.filter((e) => e.isFeatured);
          setEvents(featured.length >= 2 ? featured : data.slice(0, 5));
        }
      } catch {
        setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    };
    fetchEvents();
  }, []);

  if (isLoading || isAuthenticated) {
    return <View style={[styles.container, { backgroundColor: Colors.dark.background }]} />;
  }

  const topPadding = Platform.OS === 'web' ? webTopInset + spacing.xxxl : Math.max(insets.top, 0) + spacing.xxxl;
  const bottomPadding = Platform.OS === 'web' ? webBottomInset + spacing.xxl : Math.max(insets.bottom, 0) + spacing.xxl;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(255,77,0,0.08)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, {
          paddingTop: topPadding,
          paddingBottom: bottomPadding,
        }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandSection}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primaryLight]}
            style={styles.logoContainer}
          >
            <Ionicons name="grid" size={48} color="#fff" />
          </LinearGradient>

          <Text style={styles.brandName}>MyGrid</Text>
          <Text style={styles.tagline}>Where Motorsports Meets Media</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it Works</Text>

          <View style={styles.stepsContainer}>
            <StepItem
              number={1}
              icon="search"
              title="Find Events"
              description="Browse upcoming track days and motorsport events"
            />
            <StepItem
              number={2}
              icon="people"
              title="Connect"
              description="Find and book media creators at your event"
            />
            <StepItem
              number={3}
              icon="images"
              title="Get Content"
              description="Receive professional photos and videos of your car"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Featured Events</Text>

          {eventsLoading ? (
            <View style={styles.eventsEmptyState}>
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            </View>
          ) : events.length > 0 ? (
            <FlatList
              data={events}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.eventsListContent}
              scrollEnabled={events.length > 0}
              renderItem={({ item }) => <EventCard event={item} />}
            />
          ) : (
            <View style={styles.eventsEmptyState}>
              <Ionicons name="calendar-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={styles.emptyStateText}>No upcoming events yet</Text>
            </View>
          )}
        </View>

        <View style={styles.buttons}>
          <Pressable
            onPress={() => router.push('/(auth)/register')}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primaryDark]}
              style={styles.buttonGradient}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(auth)/login')}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={styles.secondaryButtonText}>I already have an account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function StepItem({ number, icon, title, description }: {
  number: number;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.stepItem}>
      <View style={styles.stepLeft}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.primaryDark]}
          style={styles.stepNumber}
        >
          <Text style={styles.stepNumberText}>{number}</Text>
        </LinearGradient>
        {number < 3 && <View style={styles.stepConnector} />}
      </View>
      <View style={styles.stepContent}>
        <View style={styles.stepIconContainer}>
          <Ionicons name={icon as any} size={22} color={Colors.dark.primary} />
        </View>
        <View style={styles.stepTextContent}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.stepDescription}>{description}</Text>
        </View>
      </View>
    </View>
  );
}

function EventCard({ event }: { event: EventItem }) {
  const dateSource = event.dateStart || event.date;
  const formattedDate = dateSource
    ? new Date(dateSource).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <View style={styles.eventCard}>
      <Image
        source={{ uri: getEventImageUrl(event.bannerImage) }}
        style={styles.eventBannerImage}
        resizeMode="cover"
      />
      <View style={{ padding: spacing.md }}>
        <Text style={styles.eventName} numberOfLines={2}>{event.name}</Text>
        {event.location ? (
          <View style={styles.eventDetail}>
            <Ionicons name="location-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.eventDetailText} numberOfLines={1}>{event.location}</Text>
          </View>
        ) : null}
        {formattedDate ? (
          <View style={styles.eventDetail}>
            <Ionicons name="calendar-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.eventDetailText}>{formattedDate}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl + spacing.lg,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  brandName: {
    fontSize: 40,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
    marginBottom: spacing.xl,
  },
  stepsContainer: {
    gap: 0,
  },
  stepItem: {
    flexDirection: 'row',
    minHeight: 80,
  },
  stepLeft: {
    alignItems: 'center',
    width: 36,
    marginRight: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#fff',
  },
  stepConnector: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.dark.border,
    marginVertical: spacing.xs,
  },
  stepContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  stepIconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTextContent: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  stepTitle: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
    marginBottom: spacing.xs,
  },
  stepDescription: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  eventsListContent: {
    gap: spacing.md,
  },
  eventCard: {
    width: 200,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.lg,
    padding: 0,
    borderWidth: 1,
    borderColor: Colors.dark.borderLight,
    overflow: 'hidden',
  },
  eventBannerImage: {
    width: '100%',
    height: 100,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  eventBannerPlaceholder: {
    width: '100%',
    height: 100,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventName: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: Colors.dark.text,
    marginBottom: spacing.sm,
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  eventDetailText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  eventsEmptyState: {
    height: 100,
    backgroundColor: Colors.dark.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.borderLight,
    gap: spacing.sm,
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  buttons: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryButton: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  buttonGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: '#fff',
  },
  secondaryButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: Colors.dark.textSecondary,
  },
});
