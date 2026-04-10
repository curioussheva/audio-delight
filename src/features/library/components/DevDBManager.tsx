// src/features/library/components/DevDBManager.tsx
// DEV TOOL ONLY — jangan diinclude di production build

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { db } from "@/shared/lib/sqlite";
import { useTheme } from "@/context/ThemeContext";
import { LibraryScanner } from "@/features/library/api/scanner";

const DB_NAME = "pristine_audio.db";
const COL_W = 140;
const ACT_W = 50;
const PAGE_SIZE = 100; // Ukuran batch data untuk pagination

interface RowData {
  [key: string]: any;
}

export default function DevDBManager({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelected] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [data, setData] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [refreshKey, setRefresh] = useState(0);

  // Pagination states
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showSQL, setShowSQL] = useState(false);
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM songs LIMIT 10");
  const [sqlResult, setSqlResult] = useState<string>("");

  const [editCell, setEditCell] = useState<{
    rowIndex: number;
    col: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  // ── Load Tables ──────────────────────────────────────────────
  const loadTables = useCallback(() => {
    try {
      const res = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('sqlite_sequence') ORDER BY name",
      );
      setTables(res.rows?._array?.map((r: any) => r.name) ?? []);
    } catch (e: any) {
      Alert.alert("Schema Error", e.message);
    }
  }, []);

  // ── Load Table Data (With Pagination) ───────────────────────
  const loadData = useCallback(
    async (isInitial = true) => {
      if (!selectedTable) return;

      if (isInitial) {
        setLoading(true);
        setOffset(0);
        setHasMore(true);
      } else {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
      }

      try {
        const currentOffset = isInitial ? 0 : offset;
        const res = db.execute(
          `SELECT * FROM ${selectedTable} LIMIT ${PAGE_SIZE} OFFSET ${currentOffset}`,
        );
        const rows: RowData[] = res.rows?._array ?? [];

        if (isInitial) {
          if (rows.length > 0) {
            setColumns(Object.keys(rows[0]));
            setData(rows);
          } else {
            const info = db.execute(`PRAGMA table_info(${selectedTable})`);
            setColumns(info.rows?._array?.map((i: any) => i.name) ?? []);
            setData([]);
          }
        } else {
          setData((prev) => [...prev, ...rows]);
        }

        setHasMore(rows.length === PAGE_SIZE);
        setOffset(currentOffset + PAGE_SIZE);
      } catch (e: any) {
        Alert.alert("Query Error", e.message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedTable, offset, hasMore, loadingMore],
  );

  useEffect(() => {
    loadTables();
  }, [refreshKey, loadTables]);

  useEffect(() => {
    if (selectedTable) {
      loadData(true);
    }
  }, [selectedTable, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update Cell ───────────────────────────────────────────────
  const handleUpdate = () => {
    if (!editCell || !selectedTable) return;
    try {
      const rowId = data[editCell.rowIndex].id;
      db.execute(
        `UPDATE ${selectedTable} SET ${editCell.col} = ? WHERE id = ?`,
        [editValue, rowId],
      );

      // Update data lokal biar tidak perlu loading ulang ke awal offset
      const newData = [...data];
      newData[editCell.rowIndex][editCell.col] = editValue;
      setData(newData);

      setEditCell(null);
      Alert.alert("✅ Updated");
    } catch (e: any) {
      Alert.alert("Update Error", e.message);
    }
  };

  // ── Delete Row ────────────────────────────────────────────────
  const handleDelete = (row: RowData) => {
    Alert.alert("Hapus Row?", `id: ${row.id}`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: () => {
          try {
            db.execute(`DELETE FROM ${selectedTable} WHERE id = ?`, [row.id]);
            setData(data.filter((r) => r.id !== row.id));
          } catch (e: any) {
            Alert.alert("Delete Error", e.message);
          }
        },
      },
    ]);
  };

  // ── Export CSV ────────────────────────────────────────────────
  const handleExportCSV = async () => {
    if (!selectedTable || data.length === 0) {
      return Alert.alert(
        "Peringatan",
        "Pilih tabel dan pastikan ada data untuk di-export.",
      );
    }

    try {
      setProcessing(true);

      // Ambil seluruh data tanpa limit khusus untuk export
      const res = db.execute(`SELECT * FROM ${selectedTable}`);
      const allRows: RowData[] = res.rows?._array ?? [];

      if (allRows.length === 0) throw new Error("Tabel kosong");

      const header = columns.join(",");
      const csvRows = allRows.map((row) =>
        columns
          .map((col) => {
            const val = String(row[col] ?? "");
            return `"${val.replace(/"/g, '""')}"`; // Escape double quotes
          })
          .join(","),
      );

      const csvContent = `${header}\n${csvRows.join("\n")}`;
      const fileName = `${selectedTable}_Export_${Date.now()}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle: `Export ${selectedTable} ke CSV`,
        UTI: "public.comma-separated-values-text",
      });
    } catch (e: any) {
      Alert.alert("Export Error", e.message);
    } finally {
      setProcessing(false);
    }
  };

  // ── Run Custom SQL ────────────────────────────────────────────
  const handleRunSQL = () => {
    try {
      const res = db.execute(sqlQuery);
      const rows = res.rows?._array ?? [];
      setSqlResult(JSON.stringify(rows, null, 2));
      setRefresh((k) => k + 1);
    } catch (e: any) {
      setSqlResult(`ERROR: ${e.message}`);
    }
  };

  // ── Backup ────────────────────────────────────────────────────
  const handleBackup = async () => {
    try {
      setProcessing(true);
      const dbPath = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
      const info = await FileSystem.getInfoAsync(dbPath);
      if (!info.exists) throw new Error("File DB tidak ditemukan.");
      await Sharing.shareAsync(dbPath, {
        mimeType: "application/x-sqlite3",
        dialogTitle: "Backup PristineAudio DB",
      });
    } catch (e: any) {
      Alert.alert("Backup Error", e.message);
    } finally {
      setProcessing(false);
    }
  };

  // ── Wipe ──────────────────────────────────────────────────────
  const handleWipe = () => {
    Alert.alert(
      "⚠️ Wipe All Data?",
      "Seluruh lagu akan dihapus dari library.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Wipe",
          style: "destructive",
          onPress: () => {
            LibraryScanner.clearLibrary();
            setRefresh((k) => k + 1);
            Alert.alert("🧹 Done", "Library cleared.");
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={[s.root, { backgroundColor: colors.background.primary }]}
      edges={["top", "bottom"]}
    >
      {/* HEADER */}
      <View
        style={[
          s.header,
          {
            backgroundColor: colors.background.secondary,
            borderBottomColor: "#333",
          },
        ]}
      >
        <Text style={[s.title, { color: colors.text.primary }]}>
          🛠 DB Manager
        </Text>
        <View style={s.headerActions}>
          <TouchableOpacity
            onPress={handleExportCSV}
            disabled={processing}
            style={s.iconBtn}
          >
            <Ionicons
              name="document-text-outline"
              size={22}
              color={colors.primary[400]}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBackup}
            disabled={processing}
            style={s.iconBtn}
          >
            <Ionicons
              name="cloud-download-outline"
              size={22}
              color={colors.primary[400]}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSQL(true)} style={s.iconBtn}>
            <Ionicons
              name="terminal-outline"
              size={22}
              color={colors.primary[400]}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleWipe} style={s.iconBtn}>
            <Ionicons
              name="trash-outline"
              size={22}
              color={colors.status?.error ?? "#f87171"}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={s.iconBtn}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* TABLE SELECTOR */}
      <View
        style={{ height: 48, backgroundColor: colors.background.secondary }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.md,
            alignItems: "center",
            gap: 8,
          }}
        >
          {tables.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setSelected(t)}
              style={[
                s.chip,
                {
                  backgroundColor:
                    selectedTable === t
                      ? colors.primary[500]
                      : colors.background.tertiary,
                },
              ]}
            >
              <Text
                style={{
                  color: selectedTable === t ? "#fff" : colors.text.secondary,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ROW COUNT (Sekarang dinamis mengikuti offset) */}
      {selectedTable && !loading && (
        <Text style={[s.rowCount, { color: colors.text.tertiary }]}>
          Menampilkan {data.length} baris
        </Text>
      )}

      {/* DATA GRID */}
      <View style={{ flex: 1 }}>
        {loading && data.length === 0 ? (
          <View style={s.center}>
            <ActivityIndicator color={colors.primary[500]} size="large" />
          </View>
        ) : !selectedTable ? (
          <View style={s.center}>
            <Ionicons
              name="server-outline"
              size={48}
              color={colors.text.tertiary}
            />
            <Text style={{ color: colors.text.tertiary, marginTop: 12 }}>
              Pilih tabel di atas
            </Text>
          </View>
        ) : (
          <ScrollView horizontal>
            <View>
              {/* Header */}
              <View
                style={[s.row, { backgroundColor: colors.background.tertiary }]}
              >
                <View style={[s.cell, { width: ACT_W }]} />
                {columns.map((col) => (
                  <View key={col} style={[s.cell, { width: COL_W }]}>
                    <Text
                      style={{
                        color: colors.primary[400],
                        fontSize: 10,
                        fontWeight: "700",
                      }}
                    >
                      {col.toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Rows */}
              <FlatList
                data={data}
                keyExtractor={(_, i) => i.toString()}
                onEndReached={() => loadData(false)}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  loadingMore ? (
                    <ActivityIndicator
                      style={{ padding: 20 }}
                      color={colors.primary[500]}
                    />
                  ) : null
                }
                renderItem={({ item, index }) => (
                  <View
                    style={[
                      s.row,
                      {
                        backgroundColor:
                          index % 2 === 0
                            ? colors.background.primary
                            : colors.background.secondary,
                      },
                    ]}
                  >
                    {/* Delete */}
                    <TouchableOpacity
                      style={[s.cell, { width: ACT_W, alignItems: "center" }]}
                      onPress={() => handleDelete(item)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={14}
                        color={colors.status.error}
                      />
                    </TouchableOpacity>

                    {/* Cells */}
                    {columns.map((col) => {
                      const isEditing =
                        editCell?.rowIndex === index && editCell?.col === col;
                      return (
                        <TouchableOpacity
                          key={col}
                          style={[
                            s.cell,
                            { width: COL_W },
                            isEditing && {
                              backgroundColor: colors.primary[900],
                            },
                          ]}
                          onLongPress={() => {
                            setEditCell({ rowIndex: index, col });
                            setEditValue(String(item[col] ?? ""));
                          }}
                        >
                          {isEditing ? (
                            <TextInput
                              value={editValue}
                              onChangeText={setEditValue}
                              onBlur={handleUpdate}
                              autoFocus
                              style={{
                                color: colors.primary[300],
                                fontSize: 11,
                                fontFamily:
                                  Platform.OS === "ios" ? "Menlo" : "monospace",
                                padding: 0,
                              }}
                            />
                          ) : (
                            <Text
                              numberOfLines={1}
                              style={{
                                color: colors.text.secondary,
                                fontSize: 11,
                                fontFamily:
                                  Platform.OS === "ios" ? "Menlo" : "monospace",
                              }}
                            >
                              {item[col] === null ? "NULL" : String(item[col])}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                ListEmptyComponent={
                  <View style={s.center}>
                    <Text style={{ color: colors.text.tertiary }}>
                      Tabel kosong
                    </Text>
                  </View>
                }
              />
            </View>
          </ScrollView>
        )}
      </View>

      {/* SQL MODAL */}
      <Modal
        visible={showSQL}
        animationType="slide"
        onRequestClose={() => setShowSQL(false)}
      >
        <SafeAreaView
          style={[s.root, { backgroundColor: colors.background.primary }]}
        >
          <View
            style={[s.header, { backgroundColor: colors.background.secondary }]}
          >
            <Text style={[s.title, { color: colors.text.primary }]}>
              ⚡ SQL Runner
            </Text>
            <TouchableOpacity
              onPress={() => setShowSQL(false)}
              style={s.iconBtn}
            >
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 12 }}>
            <TextInput
              multiline
              value={sqlQuery}
              onChangeText={setSqlQuery}
              style={[
                s.sqlInput,
                {
                  color: colors.text.primary,
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.primary[700],
                },
              ]}
              placeholder="SELECT * FROM songs LIMIT 10"
              placeholderTextColor={colors.text.tertiary}
            />

            <TouchableOpacity
              onPress={handleRunSQL}
              style={[s.runBtn, { backgroundColor: colors.primary[500] }]}
            >
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>
                Run Query
              </Text>
            </TouchableOpacity>

            {sqlResult !== "" && (
              <ScrollView horizontal>
                <Text
                  style={[
                    s.sqlResult,
                    {
                      color: colors.text.secondary,
                      backgroundColor: colors.background.secondary,
                    },
                  ]}
                >
                  {sqlResult}
                </Text>
              </ScrollView>
            )}

            <Text
              style={{
                color: colors.text.tertiary,
                fontSize: 12,
                marginTop: 12,
              }}
            >
              SHORTCUTS
            </Text>
            {[
              "SELECT COUNT(*) FROM songs",
              "SELECT title, artist, isEnriched FROM songs LIMIT 20",
              "SELECT * FROM songs WHERE isEnriched = 0 LIMIT 10",
              "DELETE FROM songs",
              "SELECT * FROM playlists",
            ].map((q) => (
              <TouchableOpacity
                key={q}
                onPress={() => setSqlQuery(q)}
                style={[
                  s.shortcut,
                  { backgroundColor: colors.background.tertiary },
                ]}
              >
                <Text
                  style={{
                    color: colors.primary[400],
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                >
                  {q}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {processing && (
        <View style={s.overlay}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  rowCount: { fontSize: 11, paddingHorizontal: 16, paddingVertical: 4 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  cell: {
    padding: 8,
    justifyContent: "center",
    borderRightWidth: 0.5,
    borderRightColor: "#333",
  },
  sqlInput: {
    minHeight: 120,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    textAlignVertical: "top",
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
  },
  sqlResult: {
    padding: 12,
    borderRadius: 8,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    minWidth: "100%",
  },
  shortcut: { padding: 10, borderRadius: 6, marginBottom: 6 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 9999,
  },
});
