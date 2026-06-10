import React, { useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { getQueryFn, queryClient } from '@/lib/query-client';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset } from '@/constants/theme';

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();

  const { data: conversations = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/conversations'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    select: (data) => data ?? [],
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    }, [])
  );

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPadding + spacing.lg }]}>
        <Text style={styles.headerTitle}>Messages</Text>
        {conversations.length > 0 && (
          <Text style={styles.headerCount}>{conversations.length}</Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.dark.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.otherUser.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="chatbubbles-outline" size={30} color={Colors.dark.primary} />
              </View>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySubtitle}>
                Start a conversation from a creator profile or booking
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => router.push(`/chat/${item.otherUser.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

function ConversationItem({ conversation, onPress }: { conversation: any; onPress: () => void }) {
  const { otherUser, lastMessage, unreadCount } = conversation;
  const time = new Date(lastMessage.createdAt);
  const isToday = new Date().toDateString() === time.toDateString();
  const timeStr = isToday
    ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : time.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const hasUnread = unreadCount > 0;
  const initial = (otherUser.displayName || '?')[0].toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        pressed && { backgroundColor: Colors.dark.surfaceHighlight },
      ]}
    >
      {/* Avatar */}
      {hasUnread ? (
        <LinearGradient
          colors={['#B082FF', '#7040D0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={[styles.avatarText, { color: '#fff' }]}>{initial}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            style={[styles.name, hasUnread && styles.nameUnread]}
            numberOfLines={1}
          >
            {otherUser.displayName}
          </Text>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>{timeStr}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text
            style={[styles.preview, hasUnread && styles.previewUnread]}
            numberOfLines={1}
          >
            {lastMessage.messageText}
          </Text>
          {hasUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'baseline',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: 28, fontFamily: fonts.headingBold, color: Colors.dark.text,
  },
  headerCount: {
    fontSize: 14, fontFamily: fonts.mono, color: Colors.dark.textMuted,
  },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingBottom: 100 },

  separator: {
    height: 1,
    backgroundColor: Colors.dark.borderLight,
    marginLeft: spacing.xl + 52 + spacing.md, // align under text, past avatar
  },

  // ── Empty ──
  emptyState: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.dark.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: 17, fontFamily: fonts.semiBold, color: Colors.dark.text,
  },
  emptySubtitle: {
    fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.textMuted,
    textAlign: 'center', paddingHorizontal: spacing.xxxl,
  },

  // ── Item ──
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20, fontFamily: fonts.bold, color: Colors.dark.textSecondary,
  },
  content: { flex: 1, gap: 4 },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  name: {
    fontSize: 16, fontFamily: fonts.medium, color: Colors.dark.textSecondary,
    flex: 1, marginRight: spacing.sm,
  },
  nameUnread: { fontFamily: fonts.semiBold, color: Colors.dark.text },
  time: { fontSize: 12, fontFamily: fonts.regular, color: Colors.dark.textMuted },
  timeUnread: { color: Colors.dark.primary },
  bottomRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  preview: {
    fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.textMuted,
    flex: 1, marginRight: spacing.sm,
  },
  previewUnread: { fontFamily: fonts.medium, color: Colors.dark.textSecondary },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontFamily: fonts.bold, color: '#fff' },
});
