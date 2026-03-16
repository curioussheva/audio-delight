import { useState, useEffect, useCallback } from 'react';
import { LibraryScanner } from '@/services/library/LibraryScanner';
import { Song } from '@/types/audio';

export const useLibrary = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Inisialisasi DB jika belum
      await LibraryScanner.initDatabase();
      
      // Ambil data dari SQLite
      const data = await LibraryScanner.getLibrarySongs();
      setSongs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat library');
    } finally {
      setLoading(false);
    }
  }, []);

  // Jalankan saat hook pertama kali dipasang
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  return { 
    songs, 
    loading, 
    error, 
    reload: loadLibrary 
  };
};
