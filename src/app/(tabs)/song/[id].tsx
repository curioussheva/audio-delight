import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer';
import { useFavorites } from '@/hooks/useFavorites';
import { SpectogramView } from '@/components/analyzer/SpectogramView';

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams();
  const { songs } = useMediaLibrary();
  const { getAnalysis, analyzeSong, analyzing } = useAudioAnalyzer();
  const { isFavorite, toggleFavorite } = useFavorites(songs);
  
  const [song, setSong] = useState<any>(null);
  const analysis = song ? getAnalysis(song.id) : null;

  useEffect(() => {
    const found = songs.find(s => s.id === id);
    setSong(found);
    if (found && !getAnalysis(found.id)) {
      analyzeSong(found);
    }
  }, [id, songs]);

  if (!song) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4AA" />
      </View>
    );
  }

  const favorite = isFavorite(song.id);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {}}>
          <Ionicons name="arrow-back" size={24} color="#F0F4F8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Song Details</Text>
        <TouchableOpacity onPress={() => toggleFavorite(song.id)}>
          <Ionicons 
            name={favorite ? 'heart' : 'heart-outline'} 
            size={24} 
            color={favorite ? '#FF6B6B' : '#F0F4F8'} 
          />
        </TouchableOpacity>
      </View>

      {/* Info Dasar */}
      <View style={styles.infoContainer}>
        <Text style={styles.title}>{song.title}</Text>
        <Text style={styles.artist}>{song.artist}</Text>
        {song.album && <Text style={styles.album}>{song.album}</Text>}
      </View>

      {/* Quality Badge */}
      {analysis && (
        <View style={styles.qualityContainer}>
          <View style={[
            styles.qualityBadge,
            analysis.isLossless ? styles.losslessBadge : styles.lossyBadge
          ]}>
            <Text style={styles.qualityText}>
              {analysis.isLossless ? '✅ LOSSLESS' : '⚠️ LOSSLESS?'}
            </Text>
          </View>
          <Text style={styles.confidence}>
            Confidence: {analysis.confidence}%
          </Text>
        </View>
      )}

      {/* Spectogram */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spectogram Analysis</Text>
        <SpectogramView analysis={analysis} height={200} />
      </View>

      {/* Technical Details */}
      {analysis && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Technical Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Detected Bitrate:</Text>
            <Text style={styles.detailValue}>{analysis.detectedBitrate} kbps</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Spectral Cutoff:</Text>
            <Text style={styles.detailValue}>{analysis.spectralCutoff} Hz</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Dynamic Range:</Text>
            <Text style={styles.detailValue}>{analysis.dynamicRange} dB</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Peak Frequency:</Text>
            <Text style={styles.detailValue}>{analysis.peakFrequency} Hz</Text>
          </View>
        </View>
      )}

      {/* Warnings */}
      {analysis?.warnings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Warnings</Text>
          {analysis.warnings.map((warning, index) => (
            <View key={index} style={styles.warningItem}>
              <Ionicons name="warning" size={16} color="#FFA500" />
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="play" size={20} color="#0A1628" />
          <Text style={styles.actionText}>Play</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="add-circle" size={20} color="#0A1628" />
          <Text style={styles.actionText}>Add to Playlist</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1628',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A3A',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F0F4F8',
  },
  infoContainer: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F0F4F8',
    marginBottom: 8,
    textAlign: 'center',
  },
  artist: {
    fontSize: 20,
    color: '#C8D4E0',
    marginBottom: 4,
  },
  album: {
    fontSize: 16,
    color: '#00D4AA',
  },
  qualityContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  qualityBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 4,
  },
  losslessBadge: {
    backgroundColor: '#00D4AA',
  },
  lossyBadge: {
    backgroundColor: '#FFA500',
  },
  qualityText: {
    color: '#0A1628',
    fontWeight: 'bold',
  },
  confidence: {
    color: '#C8D4E0',
    fontSize: 12,
  },
  section: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2A3A',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F0F4F8',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2A3A',
  },
  detailLabel: {
    color: '#C8D4E0',
    fontSize: 14,
  },
  detailValue: {
    color: '#F0F4F8',
    fontSize: 14,
    fontWeight: '500',
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2A3A',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  warningText: {
    color: '#F0F4F8',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D4AA',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  actionText: {
    color: '#0A1628',
    fontSize: 14,
    fontWeight: 'bold',
  },
});