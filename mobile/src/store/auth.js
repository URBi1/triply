import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@triply_token';
const USER_KEY  = '@triply_user';

export const saveAuth  = async (token, user) => {
  await AsyncStorage.multiSet([[TOKEN_KEY, token], [USER_KEY, JSON.stringify(user)]]);
};
export const getToken  = async () => AsyncStorage.getItem(TOKEN_KEY);
export const getUser   = async () => {
  const s = await AsyncStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
};
export const clearAuth = async () => AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
