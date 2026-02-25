import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiKey, setApiKey } from "@/lib/storage";

const c = Colors.dark;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useEffect(() => {
    (async () => {
      const existing = await getApiKey();
      if (existing) {
        setKey(existing);
        setHasExistingKey(true);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!key.trim()) {
      if (Platform.OS === "web") {
        alert("Please enter a valid API key");
      } else {
        Alert.alert("Error", "Please enter a valid API key");
      }
      return;
    }
    await setApiKey(key.trim());
    setSaved(true);
    setHasExistingKey(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = async () => {
    const doClear = async () => {
      await setApiKey("");
      setKey("");
      setHasExistingKey(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    if (Platform.OS === "web") {
      if (confirm("Remove your API key?")) doClear();
    } else {
      Alert.alert("Clear API Key", "Remove your saved API key?", [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: doClear },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}
      >
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSubtitle}>Configure your AI connection</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="key-outline" size={20} color={c.accent} />
            <Text style={styles.sectionTitle}>OpenAI API Key</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Required for clothing analysis. Your key is stored locally on this
            device and never shared.
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={key}
              onChangeText={setKey}
              placeholder="sk-..."
              placeholderTextColor={c.textSecondary + "80"}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={styles.eyeBtn}
              onPress={() => setShowKey(!showKey)}
            >
              <Ionicons
                name={showKey ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={c.textSecondary}
              />
            </Pressable>
          </View>

          <View style={styles.btnRow}>
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={handleSave}
            >
              <Ionicons
                name={saved ? "checkmark-circle" : "save-outline"}
                size={18}
                color={c.background}
              />
              <Text style={styles.saveBtnText}>
                {saved ? "Saved" : "Save Key"}
              </Text>
            </Pressable>
            {hasExistingKey && (
              <Pressable
                style={({ pressed }) => [
                  styles.clearBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={handleClear}
              >
                <Ionicons name="trash-outline" size={18} color={c.danger} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={c.accent}
          />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>How to get an API Key</Text>
            <Text style={styles.infoText}>
              1. Visit platform.openai.com{"\n"}
              2. Navigate to API Keys section{"\n"}
              3. Create a new secret key{"\n"}
              4. Copy and paste it above
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={c.success} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Privacy</Text>
            <Text style={styles.infoText}>
              Your API key and listing data are stored locally on your device.
              Images are sent directly to OpenAI for analysis and are not stored
              on our servers.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: c.text,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.textSecondary,
    marginTop: 4,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: c.text,
  },
  sectionDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: c.text,
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 10,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: c.background,
  },
  clearBtn: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.danger + "20",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.danger + "30",
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "flex-start",
  },
  infoContent: {
    flex: 1,
    gap: 6,
  },
  infoTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.text,
  },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 20,
  },
});
