import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Modal, TextInput, ActivityIndicator,
  Alert, RefreshControl, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../api/client';

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

export default function TripsScreen({ navigation }) {
  const [trips, setTrips]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin]     = useState(false);
  const [form, setForm]             = useState({ name: '', start: new Date(), end: new Date() });
  const [pickerTarget, setPickerTarget] = useState(null); // 'start' | 'end'
  const [joinCode, setJoinCode]     = useState('');
  const [saving, setSaving]         = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try { setTrips(await api.get('/trips')); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load());
    return unsub;
  }, [navigation, load]);

  async function createTrip() {
    if (!form.name) { Alert.alert('Enter a trip name'); return; }
    setSaving(true);
    try {
      const trip = await api.post('/trips', {
        name: form.name,
        start_date: toISODate(form.start),
        end_date:   toISODate(form.end),
      });
      setShowCreate(false);
      setForm({ name: '', start: new Date(), end: new Date() });
      navigation.navigate('Album', { trip });
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  }

  async function joinTrip() {
    if (!joinCode.trim()) return;
    setSaving(true);
    try {
      const trip = await api.post(`/trips/join/${joinCode.trim()}`, {});
      setShowJoin(false);
      setJoinCode('');
      navigation.navigate('Album', { trip });
    } catch (e) { Alert.alert('Invalid code'); }
    finally { setSaving(false); }
  }

  const renderTrip = ({ item }) => (
    <TouchableOpacity style={s.card} onPress={() => navigation.navigate('Album', { trip: item })}>
      <View style={s.cardTop}>
        <Text style={s.cardName}>{item.name}</Text>
        <Text style={s.cardDate}>{item.start_date} → {item.end_date}</Text>
      </View>
      <View style={s.cardMeta}>
        <Text style={s.metaText}>📷 {item.photo_count ?? 0} photos</Text>
        <Text style={s.metaText}>👥 {item.member_count ?? 0} people</Text>
        <Text style={s.invite}>Code: {item.invite_code}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#5B5FEF" /></View>;

  return (
    <View style={s.root}>
      <FlatList
        data={trips}
        keyExtractor={t => t.id}
        renderItem={renderTrip}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListEmptyComponent={<Text style={s.empty}>No trips yet. Create your first one!</Text>}
        contentContainerStyle={{ padding: 16, gap: 12 }}
      />

      <View style={s.fab}>
        <TouchableOpacity style={[s.fabBtn, s.fabJoin]} onPress={() => setShowJoin(true)}>
          <Text style={[s.fabText, s.fabTextOutline]}>Join</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.fabBtn} onPress={() => setShowCreate(true)}>
          <Text style={[s.fabText, s.fabTextFilled]}>+ New trip</Text>
        </TouchableOpacity>
      </View>

      {/* Create trip modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>New trip</Text>
            <Text style={s.modalSub}>Fill in the details to get started</Text>
          </View>

          <Text style={s.inputLabel}>Trip name</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Baikal 2025"
            placeholderTextColor="#b0b8cc"
            value={form.name}
            onChangeText={v => setForm(f => ({...f, name: v}))}
          />

          <Text style={s.inputLabel}>Start date</Text>
          <TouchableOpacity style={s.dateBtn} onPress={() => setPickerTarget('start')}>
            <Text style={s.dateBtnText}>📅  {toISODate(form.start)}</Text>
          </TouchableOpacity>

          <Text style={s.inputLabel}>End date</Text>
          <TouchableOpacity style={s.dateBtn} onPress={() => setPickerTarget('end')}>
            <Text style={s.dateBtnText}>📅  {toISODate(form.end)}</Text>
          </TouchableOpacity>

          {pickerTarget && (
            <DateTimePicker
              value={form[pickerTarget]}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, date) => {
                if (date) setForm(f => ({ ...f, [pickerTarget]: date }));
                if (Platform.OS === 'android') setPickerTarget(null);
              }}
            />
          )}

          <TouchableOpacity style={s.btn} onPress={createTrip} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.btnCancel} onPress={() => { setShowCreate(false); setPickerTarget(null); }}>
            <Text style={s.btnCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Join trip modal */}
      <Modal visible={showJoin} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Join a trip</Text>
            <Text style={s.modalSub}>Enter the 8-character invite code from your friend</Text>
          </View>
          <Text style={s.inputLabel}>Invite code</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. a3f8bc12"
            placeholderTextColor="#b0b8cc"
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="none"
          />
          <TouchableOpacity style={s.btn} onPress={joinTrip} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Join</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.btnCancel} onPress={() => setShowJoin(false)}>
            <Text style={s.btnCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#f0f4ff' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:          { textAlign: 'center', color: '#aaa', marginTop: 60, fontSize: 15 },

  card:           { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10 },
  cardTop:        { marginBottom: 10 },
  cardName:       { fontSize: 18, fontWeight: '700', color: '#111' },
  cardDate:       { fontSize: 13, color: '#888', marginTop: 2 },
  cardMeta:       { flexDirection: 'row', gap: 12, alignItems: 'center' },
  metaText:       { fontSize: 13, color: '#555' },
  invite:         { marginLeft: 'auto', fontSize: 12, color: '#5B5FEF', fontWeight: '600' },

  fab:            { flexDirection: 'row', gap: 10, padding: 16 },
  fabBtn:         { flex: 1, backgroundColor: '#5B5FEF', borderRadius: 14, padding: 16, alignItems: 'center' },
  fabJoin:        { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#5B5FEF' },
  fabText:        { fontWeight: '700', fontSize: 15 },
  fabTextOutline: { color: '#5B5FEF' },
  fabTextFilled:  { color: '#fff' },

  modal:          { flex: 1, backgroundColor: '#fff' },
  modalHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: '#d0d5e8', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  modalHeader:    { backgroundColor: '#f0f4ff', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20, marginBottom: 24 },
  modalTitle:     { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 4 },
  modalSub:       { fontSize: 14, color: '#7a82a8' },

  inputLabel:     { fontSize: 12, fontWeight: '600', color: '#7a82a8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 24 },
  input:          { borderWidth: 1.5, borderColor: '#dde2f0', borderRadius: 12, padding: 14, fontSize: 16, color: '#111', marginBottom: 16, marginHorizontal: 24, backgroundColor: '#fafbff' },
  dateBtn:        { borderWidth: 1.5, borderColor: '#dde2f0', borderRadius: 12, padding: 14, marginBottom: 16, marginHorizontal: 24, backgroundColor: '#fafbff' },
  dateBtnText:    { fontSize: 16, color: '#111' },

  btn:            { backgroundColor: '#5B5FEF', borderRadius: 12, padding: 16, alignItems: 'center', marginHorizontal: 24, marginTop: 8, marginBottom: 10 },
  btnText:        { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnCancel:      { padding: 14, alignItems: 'center' },
  btnCancelText:  { color: '#888', fontSize: 15 },
});
