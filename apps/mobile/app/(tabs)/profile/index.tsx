import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Profile, ProfilePrompt } from "../../../src/lib/types";
import { useAuth } from "../../../src/store/useAuth";
import { useProfile } from "../../../src/store/useProfile";
import { useMatches } from "../../../src/store/useMatches";

export const options = {
  title: "Profile",
};
const emptyPrompt: ProfilePrompt = { question: "", answer: "" };

const normalizePrompts = (items: ProfilePrompt[]) =>
  items
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.question && item.answer);

const canonicalProfileShape = (profile: Profile) => ({
  name: profile.name.trim(),
  age: profile.age ?? undefined,
  bio: profile.bio.trim(),
  personaSeed: profile.personaSeed.trim(),
  prompts: normalizePrompts(profile.prompts),
  hobbies: profile.hobbies.map((hobby) => hobby.trim()).filter(Boolean),
  photoURIs: profile.photoURIs,
  isPro: profile.isPro,
});

export default function ProfileScreen() {
  const auth = useAuth((state) => state.user);
  const signOut = useAuth((state) => state.signOut);
  const profile = useProfile((state) => state.profile);
  const loadProfile = useProfile((state) => state.load);
  const saveProfile = useProfile((state) => state.save);
  const setPro = useProfile((state) => state.setPro);
  const resetProfile = useProfile((state) => state.reset);
  const isLoadingProfile = useProfile((state) => state.isLoading);
  const isSavingProfile = useProfile((state) => state.isSaving);
  const lastError = useProfile((state) => state.error);
  const resetMatches = useMatches((state) => state.reset);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [personaSeed, setPersonaSeed] = useState("");
  const [hobbiesText, setHobbiesText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([emptyPrompt]);

  useFocusEffect(
    useCallback(() => {
      if (auth?.id) {
        loadProfile(auth.id).catch(() => {});
      }
    }, [auth?.id, loadProfile]),
  );

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setAge(profile.age ? String(profile.age) : "");
    setBio(profile.bio);
    setPersonaSeed(profile.personaSeed);
    setHobbiesText(profile.hobbies.join(", "));
    setPhotos(profile.photoURIs);
    setPrompts(
      profile.prompts.length
        ? profile.prompts.map((prompt) => ({ ...prompt }))
        : [emptyPrompt],
    );
  }, [profile]);

  const draftProfile = useMemo<Profile>(() => {
    const parsedAge = age.trim() ? Number(age.trim()) : undefined;
    const safeAge = Number.isNaN(parsedAge) ? undefined : parsedAge;
    const trimmedPersona = personaSeed.trim();
    const normalizedHobbies = hobbiesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      userId: auth?.id ?? profile?.userId ?? "",
      name: name.trim(),
      age: safeAge,
      bio: bio.trim(),
      personaSeed: trimmedPersona,
      prompts: normalizePrompts(prompts),
      hobbies: normalizedHobbies,
      photoURIs: photos,
      isPro: profile?.isPro ?? false,
    };
  }, [age, auth?.id, bio, hobbiesText, name, personaSeed, photos, profile?.isPro, profile?.userId, prompts]);

  const hasChanges = useMemo(() => {
    if (!profile) return true;
    return (
      JSON.stringify(canonicalProfileShape(profile)) !==
      JSON.stringify(canonicalProfileShape(draftProfile))
    );
  }, [draftProfile, profile]);

  const handleSave = async () => {
    if (!auth) return;
    if (!draftProfile.name || !draftProfile.bio) {
      Alert.alert("Missing info", "Name and bio are required.");
      return;
    }
    if (age.trim() && Number.isNaN(Number(age.trim()))) {
      Alert.alert("Invalid age", "Age must be a valid number.");
      return;
    }

    try {
      await saveProfile({
        ...draftProfile,
        personaSeed: draftProfile.personaSeed || "Friendly and curious.",
      });
      Alert.alert("Profile saved", "Your profile was updated.");
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? "We couldn’t save your profile.");
    }
  };

  const handleTogglePro = async (value: boolean) => {
    if (!auth?.id) return;
    try {
      await setPro(auth.id, value);
    } catch (error: any) {
      Alert.alert("Autopilot", error?.message ?? "Unable to update your plan right now.");
    }
  };

  const handleSignOut = async () => {
    resetMatches();
    resetProfile();
    await signOut();
  };

  const handleAddPrompt = () => {
    setPrompts((prev) => [...prev, { ...emptyPrompt }]);
  };

  const handleRemovePrompt = (index: number) => {
    setPrompts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to add pictures.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.length) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((item) => item !== uri));
  };

  if (!auth) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Sign in to edit your profile.</Text>
      </View>
    );
  }

  const isHydrating = isLoadingProfile && !profile;

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      {isHydrating ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#ff4f81" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          scrollEventThrottle={16}
        >
          {/* ---------- Original Header ---------- */}
          <View style={styles.header}>
            <Text style={styles.heading}>Your profile</Text>
            <Text style={styles.subheading}>
              Share a few highlights so matches know you better.
            </Text>
          </View>

          {lastError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{lastError}</Text>
            </View>
          ) : null}

          {/* ---------- Fields ---------- */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              placeholder="Name"
              value={name}
              onChangeText={setName}
              style={styles.input}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              placeholder="Age (optional)"
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              placeholder="A quick intro"
              value={bio}
              onChangeText={setBio}
              multiline
              style={[styles.input, styles.textArea]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Persona cue</Text>
            <Text style={styles.fieldHint}>
              Helps Autopilot capture your voice. Keep it short and specific.
            </Text>
            <TextInput
              placeholder="Friendly foodie who plans spontaneous weekend hikes."
              value={personaSeed}
              onChangeText={setPersonaSeed}
              multiline
              style={[styles.input, styles.textArea]}
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Prompts</Text>
            <TouchableOpacity onPress={handleAddPrompt}>
              <Text style={styles.sectionAction}>Add prompt</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sectionBody}>
            {prompts.map((prompt, index) => (
              <View key={`prompt-${index}`} style={styles.promptCard}>
                <TextInput
                  placeholder="Question"
                  value={prompt.question}
                  onChangeText={(text) =>
                    setPrompts((prev) => {
                      const next = [...prev];
                      next[index] = { ...next[index], question: text };
                      return next;
                    })
                  }
                  style={styles.input}
                />
                <TextInput
                  placeholder="Answer"
                  value={prompt.answer}
                  onChangeText={(text) =>
                    setPrompts((prev) => {
                      const next = [...prev];
                      next[index] = { ...next[index], answer: text };
                      return next;
                    })
                  }
                  style={[styles.input, styles.textAreaSmall]}
                  multiline
                />
                {prompts.length > 1 ? (
                  <TouchableOpacity
                    style={styles.removePromptButton}
                    onPress={() => handleRemovePrompt(index)}
                  >
                    <Text style={styles.removePromptText}>Remove prompt</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Hobbies</Text>
            <Text style={styles.fieldHint}>Separate each hobby with a comma.</Text>
            <TextInput
              placeholder="Climbing, Cooking, Photography"
              value={hobbiesText}
              onChangeText={setHobbiesText}
              style={styles.input}
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <TouchableOpacity onPress={handleAddPhoto}>
              <Text style={styles.sectionAction}>Add photo</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {photos.map((uri) => (
              <View key={uri} style={styles.photoThumbWrapper}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => handleRemovePhoto(uri)}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addPhotoCard} onPress={handleAddPhoto}>
              <Text style={styles.addPhotoIcon}>＋</Text>
              <Text style={styles.addPhotoLabel}>Add</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Wingmate Autopilot</Text>
              <Text style={styles.switchHint}>
                Let Wingmate draft replies and keep conversations moving.
              </Text>
            </View>
            <Switch
              value={profile?.isPro ?? false}
              onValueChange={handleTogglePro}
              trackColor={{ true: "#ff9fb5", false: "#ccc" }}
              thumbColor={(profile?.isPro ?? false) ? "#ff4f81" : "#f4f3f4"}
              disabled={isSavingProfile}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || isSavingProfile) && styles.saveDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || isSavingProfile}
          >
            <Text style={styles.saveButtonText}>
              {isSavingProfile ? "Saving…" : "Save profile"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 20 },
  header: { gap: 8 },
  heading: { fontSize: 26, fontWeight: "700", color: "#111" },
  subheading: { fontSize: 15, color: "#666", lineHeight: 22 },
  errorBanner: {
    backgroundColor: "#ffe6eb",
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: "#c11d4a", fontWeight: "600" },
  fieldGroup: { gap: 8 },
  label: { fontSize: 16, fontWeight: "600", color: "#222" },
  fieldHint: { fontSize: 13, color: "#777" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  textArea: { minHeight: 112, textAlignVertical: "top" },
  textAreaSmall: { minHeight: 80, textAlignVertical: "top" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#222" },
  sectionAction: { fontSize: 14, fontWeight: "600", color: "#ff4f81" },
  sectionBody: { gap: 12 },
  promptCard: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    backgroundColor: "#fff",
  },
  removePromptButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fbe3ea",
  },
  removePromptText: { color: "#c11d4a", fontWeight: "600" },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photoThumbWrapper: { position: "relative" },
  photoThumb: {
    width: 108,
    height: 108,
    borderRadius: 18,
    backgroundColor: "#f0f0f0",
  },
  removePhotoButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 999,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  removePhotoText: { color: "#fff", fontSize: 16, lineHeight: 18 },
  addPhotoCard: {
    width: 108,
    height: 108,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoIcon: { fontSize: 28, color: "#ff4f81", lineHeight: 32 },
  addPhotoLabel: { fontSize: 12, color: "#ff4f81", marginTop: 4 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  switchHint: { color: "#666", marginTop: 4, fontSize: 13 },
  saveButton: {
    backgroundColor: "#ff4f81",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  signOutButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  signOutText: { fontSize: 16, color: "#444", fontWeight: "600" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  centeredText: { fontSize: 16, color: "#555", textAlign: "center" },
});
