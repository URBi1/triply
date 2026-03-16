import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, FlatList, TextInput,
  TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, Dimensions, ActivityIndicator,
} from 'react-native';
import { api, API_URL } from '../api/client';

const { width } = Dimensions.get('window');

export default function PhotoScreen({ route }) {
  const { photo } = route.params;
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);

  useEffect(() => { loadComments(); }, []);

  async function loadComments() {
    setComments(await api.get(`/photos/${photo.id}/comments`));
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post(`/photos/${photo.id}/comments`, { text: text.trim() });
      setText('');
      loadComments();
    } finally { setSending(false); }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Image source={{ uri: `${API_URL}${photo.url}` }} style={s.image} resizeMode="contain" />

      <View style={s.meta}>
        <Text style={s.author}>{photo.author_name}</Text>
        {photo.taken_at && <Text style={s.date}>{new Date(photo.taken_at).toLocaleDateString()}</Text>}
      </View>

      <FlatList
        data={comments}
        keyExtractor={c => c.id}
        style={s.comments}
        renderItem={({ item }) => (
          <View style={s.comment}>
            <Text style={s.commentAuthor}>{item.author_name}</Text>
            <Text style={s.commentText}>{item.text}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={s.noComments}>No comments yet</Text>}
      />

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="Add a comment…"
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={s.sendBtn} onPress={send} disabled={sending}>
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.sendText}>Send</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#fff' },
  image:         { width, height: width, backgroundColor: '#000' },
  meta:          { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  author:        { fontWeight: '700', fontSize: 15 },
  date:          { color: '#888', fontSize: 13 },
  comments:      { flex: 1, paddingHorizontal: 12 },
  noComments:    { color: '#aaa', textAlign: 'center', marginTop: 20 },
  comment:       { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  commentAuthor: { fontWeight: '600', fontSize: 13, marginBottom: 2 },
  commentText:   { fontSize: 14, color: '#333' },
  inputRow:      { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#eee' },
  input:         { flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10, padding: 10, fontSize: 14 },
  sendBtn:       { backgroundColor: '#5B5FEF', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  sendText:      { color: '#fff', fontWeight: '700' },
});
