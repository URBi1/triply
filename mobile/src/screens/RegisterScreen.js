import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { api } from '../api/client';
import { saveAuth } from '../store/auth';

export default function RegisterScreen({ onRegistered }) {
  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function register() {
    if (!name.trim()) { setError('Enter your name'); return; }
    setLoading(true); setError('');
    try {
      const { token, user } = await api.post('/auth/register', { name: name.trim() });
      await saveAuth(token, user);
      onRegistered(user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <Text style={s.logo}>✈️ Triply</Text>
        <Text style={s.title}>Your name</Text>
        <Text style={s.sub}>Friends will see this in the shared album</Text>

        <TextInput
          style={s.input}
          placeholder="e.g. Anna K."
          value={name}
          onChangeText={setName}
          onSubmitEditing={register}
          returnKeyType="done"
          autoFocus
        />
        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity style={s.btn} onPress={register} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Get started →</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#f0f4ff', justifyContent: 'center', padding: 24 },
  card:    { backgroundColor: '#fff', borderRadius: 20, padding: 28, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20 },
  logo:    { fontSize: 32, textAlign: 'center', marginBottom: 24 },
  title:   { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 6 },
  sub:     { fontSize: 14, color: '#888', marginBottom: 20 },
  input:   { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  error:   { color: '#ef4444', fontSize: 13, marginBottom: 8 },
  btn:     { backgroundColor: '#5B5FEF', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
