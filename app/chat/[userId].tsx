import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getQueryFn, apiRequest, queryClient } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { fonts, spacing, radius, webTopInset, webBottomInset } from '@/constants/theme';

export default function ChatScreen() {
  const { userId: otherUserId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const { data: otherUser } = useQuery<any>({
    queryKey: ['/api/users', otherUserId],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!otherUserId,
  });

  const { data: messages = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/messages', otherUserId],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!otherUserId,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    select: (data) => data ?? [],
  });

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setMessage('');
    try {
      await apiRequest('POST', '/api/messages', {
        receiverId: otherUserId,
        messageText: trimmed,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/messages', otherUserId] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    } catch (err) {
      console.error(err);
      setMessage(trimmed);
    } finally {
      setSending(false);
    }
  };

  const topPadding = Platform.OS === 'web' ? webTopInset : insets.top;

  const reversedMessages = [...messages].reverse();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPadding + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {(otherUser?.displayName || '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherUser?.displayName || 'Loading...'}
          </Text>
        </View>
        <Pressable
          onPress={() => otherUserId && router.push(`/profile/${otherUserId}`)}
          style={styles.profileBtn}
        >
          <Ionicons name="person-outline" size={20} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.dark.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={reversedMessages}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubble-outline" size={40} color={Colors.dark.textMuted} />
                <Text style={styles.emptyChatText}>No messages yet</Text>
                <Text style={styles.emptyChatSubtext}>Say hello to start the conversation</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMine = item.senderId === user?.id;
              return (
                <View style={[
                  styles.messageBubbleRow,
                  isMine ? styles.messageBubbleRowMine : styles.messageBubbleRowTheirs,
                ]}>
                  <View style={[
                    styles.messageBubble,
                    isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
                  ]}>
                    <Text style={[
                      styles.messageText,
                      isMine ? styles.messageTextMine : styles.messageTextTheirs,
                    ]}>
                      {item.messageText}
                    </Text>
                    <Text style={styles.messageTime}>
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={[styles.inputBar, {
          paddingBottom: Math.max(insets.bottom, webBottomInset) + spacing.sm,
        }]}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor={Colors.dark.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={handleSend}
            disabled={!message.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              (!message.trim() || sending) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.dark.surfaceHighlight, alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 14, fontFamily: fonts.bold, color: Colors.dark.textSecondary },
  headerName: { fontSize: 16, fontFamily: fonts.semiBold, color: Colors.dark.text, flex: 1 },
  profileBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  messagesContent: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  emptyChat: {
    alignItems: 'center', paddingTop: 60, gap: spacing.sm,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: { fontSize: 16, fontFamily: fonts.semiBold, color: Colors.dark.textSecondary },
  emptyChatSubtext: { fontSize: 14, fontFamily: fonts.regular, color: Colors.dark.textMuted },
  messageBubbleRow: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
  },
  messageBubbleRowMine: { justifyContent: 'flex-end' },
  messageBubbleRowTheirs: { justifyContent: 'flex-start' },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  messageBubbleMine: {
    backgroundColor: Colors.dark.primary,
    borderBottomRightRadius: 4,
  },
  messageBubbleTheirs: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    fontFamily: fonts.regular,
    lineHeight: 21,
  },
  messageTextMine: { color: '#fff' },
  messageTextTheirs: { color: Colors.dark.text },
  messageTime: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  messageInput: {
    flex: 1, backgroundColor: Colors.dark.background,
    borderRadius: radius.xl, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, fontSize: 15,
    fontFamily: fonts.regular, color: Colors.dark.text,
    maxHeight: 100, minHeight: 42,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
});
