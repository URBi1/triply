import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { getUser } from './src/store/auth';
import RegisterScreen from './src/screens/RegisterScreen';
import TripsScreen    from './src/screens/TripsScreen';
import AlbumScreen    from './src/screens/AlbumScreen';
import PhotoScreen    from './src/screens/PhotoScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser]   = useState(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getUser().then(u => { setUser(u); setReady(true); });
  }, []);

  if (!ready) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#5B5FEF" />
    </View>
  );

  if (!user) return <RegisterScreen onRegistered={setUser} />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#5B5FEF',
        headerTitleStyle: { fontWeight: '700' },
      }}>
        <Stack.Screen name="Trips" component={TripsScreen} options={{ title: '✈️ My Trips' }} />
        <Stack.Screen name="Album" component={AlbumScreen} />
        <Stack.Screen name="Photo" component={PhotoScreen} options={{ title: 'Photo' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
