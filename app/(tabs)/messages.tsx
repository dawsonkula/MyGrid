import React, { useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    }, [])
  );

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + spacing.lg }]}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.otherUser.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>Start a conversation from a profile or booking</Text>
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.conversationItem,
        pressed && { opacity: 0.8, backgroundColor: Colors.dark.surfaceHighlight },
      ]}
    >
      <View style={[
        styles.conversationAvatar,
        unreadCount > 0 && { borderColor: Colors.dark.primary, borderWidth: 2 },
      ]}>
        <Text style={styles.conversationAvatarText}>
          {(otherUser.displayName || '?')[0].toUpperCase()}
        </Text>
      </View>

      <View style={styles.conversationInfo}>
        <View style={styles.conversationTop}>
          <Text style={[
            styles.conversationName,
            unreadCount > 0 && { color: Colors.dark.text },
          ]} numberOfLines={1}>
            {otherUser.displayName}
          </Text>
          <Text style={styles.conversationTime}>{timeStr}</Text>
        </View>
        <View style={styles.conversationBottom}>
          <Text style={[
            styles.conversationMessage,
            unreadCount > 0 && styles.conversationMessageUnread,
          ]} numberOfLines={1}>
            {lastMessage.messageText}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fonts.headingBold,
    color: Colors.dark.text,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  conversationAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationAvatarText: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: Colors.dark.textSecondary,
  },
  conversationInfo: {
    flex: 1,
    gap: 4,
  },
  conversationTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationName: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: Colors.dark.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  conversationTime: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
  },
  conversationBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationMessage: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: Colors.dark.textMuted,
    flex: 1,
    marginRight: spacing.sm,
  },
  conversationMessageUnread: {
    color: Colors.dark.textSecondary,
    fontFamily: fonts.medium,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#fff',
  },
});
