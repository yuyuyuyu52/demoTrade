import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = '/api';

  const login = async (userId) => {
    try {
      // In a real app, we would verify credentials. 
      // Here we just fetch/create the account.
      const res = await axios.post(`${API_URL}/accounts/?user_id=${userId}&initial_balance=10000`);
      const userData = res.data;
      setUser(userData);
      localStorage.setItem('user_id', userId);
      localStorage.setItem('user_data', JSON.stringify(userData));
      return userData;
    } catch (error) {
      console.error("Login failed", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_data');
  };

  useEffect(() => {
    const initAuth = async () => {
      const storedUserId = localStorage.getItem('user_id');
      const storedUserData = localStorage.getItem('user_data');

      if (storedUserData) {
        // If we have cached data, load it immediately
        setUser(JSON.parse(storedUserData));
        setLoading(false);
        
        // Then try to refresh in background if we have a user ID
        if (storedUserId) {
          try {
            await login(storedUserId);
          } catch (err) {
            console.warn("Background refresh failed, using cached data");
          }
        }
      } else if (storedUserId) {
        // If only ID exists, we must fetch
        try {
          await login(storedUserId);
        } catch (err) {
          // If fetch fails, we can't log in
          console.error("Auto-login failed", err);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
