import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { api, API_URL } from '../api/client';

const { width } = Dimensions.get('window');
const THUMB = (width - 4) / 3;

export default function AlbumScreen({ route, navigation }) {
  const { trip } = route.params;
  const [photos, setPhotos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [found, setFound]     = useState(null); // camera roll scan result
  const esRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: trip.name });
    loadPhotos();
    connectSSE();
    return () => esRef.current?.close();
  }, []);

  async function loadPhotos() {
    try { setPhotos(await api.get(`/trips/${trip.id}/photos`)); }
    finally { setLoading(false); }
  }

  function connectSSE() {
    // Native EventSource not available — use polling fallback for MVP
    const interval = setInterval(loadPhotos, 10000);
    esRef.current = { close: () => clearInterval(interval) };
  }

  // ── Auto-scan camera roll for trip dates ──────────────────────────────────
  async function scanCameraRoll() {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos'); return;
    }

    // Parse as local midnight to avoid UTC offset shifting the day
    const [sy, sm, sd] = trip.start_date.split('-').map(Number);
    const [ey, em, ed] = trip.end_date.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0).getTime();
    const end   = new Date(ey, em - 1, ed, 23, 59, 59).getTime();

    const assets = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      createdAfter:  start,
      createdBefore: end,
      first: 500,
      sortBy: MediaLibrary.SortBy.creationTime,
    });

    setFound(assets.assets);

    if (assets.assets.length === 0) {
      Alert.alert('No photos found', `No photos in your camera roll for ${trip.start_date} – ${trip.end_date}`);
      return;
    }

    Alert.alert(
      `Found ${assets.assets.length} photos`,
      `From your camera roll for this trip period. Upload all?`,
      [
        { text: 'Review first', onPress: () => uploadPhotos(assets.assets) },
        { text: 'Upload all',   onPress: () => uploadPhotos(assets.assets) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  async function uploadPhotos(assets) {
    setUploading(true);
    let uploaded = 0;

    for (const asset of assets) {
      try {
        const info   = await MediaLibrary.getAssetInfoAsync(asset);
        const form   = new FormData();
        const uri    = info.localUri || info.uri;
        const name   = uri.split('/').pop();
        const ext    = name.split('.').pop().toLowerCase();

        form.append('file', { uri, name, type: `image/${ext}` });
        if (info.location?.latitude)  form.append('lat',      String(info.location.latitude));
        if (info.location?.longitude) form.append('lng',      String(info.location.longitude));
        if (asset.creationTime)       form.append('taken_at', new Date(asset.creationTime).toISOString());

        await api.upload(`/trips/${trip.id}/photos`, form);
        uploaded++;
      } catch { /* skip failed */ }
    }

    setUploading(false);
    Alert.alert('Done!', `Uploaded ${uploaded} of ${assets.length} photos`);
    loadPhotos();
  }

  const renderPhoto = ({ item }) => (
    <TouchableOpacity onPress={() => navigation.navigate('Photo', { photo: item, trip })}>
      <Image
        source={{ uri: `${API_URL}${item.thumb_url}` }}
        style={s.thumb}
      />
    </TouchableOpacity>
  );

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#5B5FEF" /></View>;

  return (
    <View style={s.root}>
      <FlatList
        data={photos}
        keyExtractor={p => p.id}
        renderItem={renderPhoto}
        numColumns={3}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={s.emptyText}>No photos yet</Text>
            <Text style={s.emptySub}>Tap "Scan photos" to auto-import from your camera roll</Text>
          </View>
        }
      />

      <View style={s.footer}>
        {uploading
          ? <View style={s.uploadingBar}><ActivityIndicator color="#fff" /><Text style={s.uploadingText}>  Uploading…</Text></View>
          : <>
              <TouchableOpacity style={s.btn} onPress={scanCameraRoll}>
                <Text style={s.btnText}>📷 Scan photos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnInvite} onPress={() => Alert.alert('Invite code', trip.invite_code)}>
                <Text style={s.btnInviteText}>Invite</Text>
              </TouchableOpacity>
            </>
        }
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#000' },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  thumb:        { width: THUMB, height: THUMB, margin: 1 },
  emptyBox:     { flex: 1, alignItems: 'center', marginTop: 80, padding: 24 },
  emptyText:    { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySub:     { fontSize: 14, color: '#aaa', textAlign: 'center' },
  footer:       { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#111' },
  btn:          { flex: 1, backgroundColor: '#5B5FEF', borderRadius: 12, padding: 15, alignItems: 'center' },
  btnText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnInvite:    { backgroundColor: '#222', borderRadius: 12, padding: 15, paddingHorizontal: 20, alignItems: 'center' },
  btnInviteText:{ color: '#fff', fontWeight: '600', fontSize: 15 },
  uploadingBar: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#5B5FEF', borderRadius: 12, padding: 15 },
  uploadingText:{ color: '#fff', fontWeight: '600' },
});
