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
import type {
  Gender,
  GenderPreference,
  Profile,
  ProfilePrompt,
} from "../../../src/lib/types";
import { useAuth } from "../../../src/store/useAuth";
import { useProfile } from "../../../src/store/useProfile";
import { useMatches } from "../../../src/store/useMatches";
import { uploadProfilePhoto } from "../../../src/lib/storage";
import {
  formatProfileValidation,
  validateProfile,
} from "../../../src/lib/profileValidation";

export const options = {
  title: "Profile",
};

type PhotoDraft = {
  id: string;
  uri: string;
  remoteUrl?: string;
  fileName?: string;
  mimeType?: string | null;
  uploaded?: boolean;
};

const emptyPrompt: ProfilePrompt = { question: "", answer: "" };

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: "Woman", value: "woman" },
  { label: "Man", value: "man" },
  { label: "Non-binary", value: "nonbinary" },
  { label: "Other", value: "other" },
];

const PREFERENCE_OPTIONS: { label: string; value: GenderPreference }[] = [
  { label: "Women", value: "women" },
  { label: "Men", value: "men" },
  { label: "Everyone", value: "everyone" },
];

const normalizePrompts = (items: ProfilePrompt[]) =>
  items
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.question && item.answer)
    .slice(0, 3);

const canonicalProfileShape = (profile: Profile) => ({
  name: profile.name.trim(),
  age: profile.age ?? undefined,
  bio: profile.bio.trim(),
  personaSeed: profile.personaSeed.trim(),
  prompts: normalizePrompts(profile.prompts),
  hobbies: profile.hobbies.map((hobby) => hobby.trim()).filter(Boolean),
  photoURIs: profile.photoURIs,
  gender: profile.gender,
  genderPreference: profile.genderPreference,
  heightCm: profile.heightCm ?? undefined,
  ethnicity: profile.ethnicity?.trim() ?? undefined,
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
  const [gender, setGender] = useState<Gender>("other");
  const [genderPreference, setGenderPreference] =
    useState<GenderPreference>("everyone");
  const [height, setHeight] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([emptyPrompt]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (auth?.id) {
        loadProfile(auth.id).catch(() => {});
      }
    }, [auth?.id, loadProfile]),
  );

  useEffect(() => {
    if (!profile) {
      setName("");
      setAge("");
      setBio("");
      setPersonaSeed("");
      setHobbiesText("");
      setGender("other");
      setGenderPreference("everyone");
      setHeight("");
      setEthnicity("");
      setPhotoDrafts([]);
      setPrompts([emptyPrompt]);
      setValidationMessage(null);
      return;
    }
    setName(profile.name);
    setAge(profile.age ? String(profile.age) : "");
    setBio(profile.bio);
    setPersonaSeed(profile.personaSeed);
    setHobbiesText(profile.hobbies.join(", "));
    setGender(profile.gender);
    setGenderPreference(profile.genderPreference);
    setHeight(profile.heightCm ? String(profile.heightCm) : "");
    setEthnicity(profile.ethnicity ?? "");
    setPhotoDrafts(
      profile.photoURIs.map((uri, index) => ({
        id: `remote-${index}-${uri}`,
        uri,
        remoteUrl: uri,
        uploaded: true,
      })),
    );
    setPrompts(
      profile.prompts.length
        ? profile.prompts.map((prompt) => ({ ...prompt }))
        : [emptyPrompt],
    );
    setValidationMessage(null);
  }, [profile]);

  const draftProfile = useMemo<Profile>(() => {
    const parsedAge = age.trim() ? Number(age.trim()) : undefined;
    const safeAge = Number.isNaN(parsedAge) ? undefined : parsedAge;
    const trimmedPersona = personaSeed.trim();
    const normalizedHobbies = hobbiesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const parsedHeight = height.trim() ? Number(height.trim()) : undefined;
    const safeHeight = Number.isNaN(parsedHeight) ? undefined : parsedHeight;

    return {
      userId: auth?.id ?? profile?.userId ?? "",
      name: name.trim(),
      age: safeAge,
      bio: bio.trim(),
      personaSeed: trimmedPersona,
      prompts: normalizePrompts(prompts),
      hobbies: normalizedHobbies,
      photoURIs: photoDrafts.map((photo) => photo.remoteUrl ?? photo.uri),
      gender,
      genderPreference,
      heightCm: safeHeight,
      ethnicity: ethnicity.trim() ? ethnicity.trim() : undefined,
      isPro: profile?.isPro ?? false,
    };
  }, [
    age,
    auth?.id,
    bio,
    ethnicity,
    gender,
    genderPreference,
    height,
    hobbiesText,
    name,
    personaSeed,
    photoDrafts,
    profile?.isPro,
    profile?.userId,
    prompts,
  ]);

  const hasChanges = useMemo(() => {
    if (!profile) return true;
    return (
      JSON.stringify(canonicalProfileShape(profile)) !==
      JSON.stringify(canonicalProfileShape(draftProfile))
    );
  }, [draftProfile, profile]);

  const ensureRemotePhotos = useCallback(async () => {
    if (!auth?.id) {
      throw new Error("Sign in to update photos.");
    }
    if (photoDrafts.length === 0) {
      return [] as string[];
    }
    const updated: PhotoDraft[] = [];
    for (const photo of photoDrafts) {
      if (photo.remoteUrl && photo.uploaded !== false) {
        updated.push({ ...photo, uploaded: true, uri: photo.remoteUrl });
        continue;
      }
      const uploadResult = await uploadProfilePhoto({
        userId: auth.id,
        uri: photo.uri,
        fileName: photo.fileName,
        mimeType: photo.mimeType ?? undefined,
      });
      updated.push({
        ...photo,
        uploaded: true,
        remoteUrl: uploadResult.publicUrl,
        uri: uploadResult.publicUrl,
      });
    }
    setPhotoDrafts(updated);
    return updated.map((item) => item.remoteUrl ?? item.uri);
  }, [auth?.id, photoDrafts]);

  const handleSave = async () => {
    if (!auth) return;

    if (age.trim() && Number.isNaN(Number(age.trim()))) {
      Alert.alert("Invalid age", "Age must be a valid number.");
      return;
    }
    if (height.trim() && Number.isNaN(Number(height.trim()))) {
      Alert.alert("Invalid height", "Height must be a number in centimeters.");
      return;
    }

    const validation = validateProfile(draftProfile);
    if (!validation.isComplete) {
      const message = formatProfileValidation(validation);
      setValidationMessage(message);
      Alert.alert("Profile incomplete", message);
      return;
    }

    try {
      setValidationMessage(null);
      setIsUploadingPhotos(true);
      const remotePhotoURIs = await ensureRemotePhotos();
      const nextProfile: Profile = {
        ...draftProfile,
        photoURIs: remotePhotoURIs,
        personaSeed: draftProfile.personaSeed || "Friendly and curious.",
      };
      await saveProfile(nextProfile);
      Alert.alert("Profile saved", "Your profile was updated.");
    } catch (error: any) {
      const message =
        error?.message ?? "We couldn’t save your profile. Please try again.";
      setValidationMessage(message);
      Alert.alert("Save failed", message);
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleTogglePro = async (value: boolean) => {
    if (!auth?.id) return;
    try {
      await setPro(auth.id, value);
    } catch (error: any) {
      Alert.alert(
        "Autopilot",
        error?.message ?? "Unable to update your plan right now.",
      );
    }
  };

  const handleSignOut = async () => {
    resetMatches();
    resetProfile();
    await signOut();
  };

  const handleAddPrompt = () => {
    setPrompts((prev) => {
      if (prev.length >= 3) {
        Alert.alert("Limit reached", "You can add up to 3 prompts.");
        return prev;
      }
      return [...prev, { ...emptyPrompt }];
    });
  };

  const handleRemovePrompt = (index: number) => {
    setPrompts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddPhoto = async () => {
    if (photoDrafts.length >= 6) {
      Alert.alert("Limit reached", "You can upload up to 6 photos.");
      return;
    }

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
      const asset = result.assets[0];
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setPhotoDrafts((prev) => [
        ...prev,
        {
          id,
          uri: asset.uri,
          fileName: asset.fileName ?? undefined,
          mimeType: asset.mimeType ?? "image/jpeg",
          uploaded: false,
        },
      ]);
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotoDrafts((prev) => prev.filter((item) => item.id !== photoId));
  };

  if (!auth) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Sign in to edit your profile.</Text>
      </View>
    );
  }

  const isHydrating = isLoadingProfile && !profile;
  const saving = isSavingProfile || isUploadingPhotos;

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
          <View style={styles.header}>
            <Text style={styles.heading}>Your profile</Text>
            <Text style={styles.subheading}>
              Wingmate requires your name, age (18+), gender, preference, and 4-6
              photos before you can discover matches.
            </Text>
          </View>

          {lastError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{lastError}</Text>
            </View>
          ) : null}

          {validationMessage ? (
            <View style={styles.validationBanner}>
              <Text style={styles.validationText}>{validationMessage}</Text>
            </View>
          ) : null}

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
              placeholder="Age"
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.segmentRow}>
              {GENDER_OPTIONS.map((option) => {
                const active = gender === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.segmentButton, active && styles.segmentButtonActive]}
                    onPress={() => setGender(option.value)}
                  >
                    <Text
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>I’m interested in</Text>
            <View style={styles.segmentRow}>
              {PREFERENCE_OPTIONS.map((option) => {
                const active = genderPreference === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.segmentButton, active && styles.segmentButtonActive]}
                    onPress={() => setGenderPreference(option.value)}
                  >
                    <Text
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              placeholder="Optional"
              value={height}
              onChangeText={setHeight}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Ethnicity</Text>
            <TextInput
              placeholder="Optional"
              value={ethnicity}
              onChangeText={setEthnicity}
              style={styles.input}
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
            {photoDrafts.map((photo) => (
              <View key={photo.id} style={styles.photoThumbWrapper}>
                <Image
                  source={{ uri: photo.remoteUrl ?? photo.uri }}
                  style={styles.photoThumb}
                />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => handleRemovePhoto(photo.id)}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {photoDrafts.length < 6 ? (
              <TouchableOpacity style={styles.addPhotoCard} onPress={handleAddPhoto}>
                <Text style={styles.addPhotoIcon}>＋</Text>
                <Text style={styles.addPhotoLabel}>Add</Text>
              </TouchableOpacity>
            ) : null}
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
              disabled={saving}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || saving) && styles.saveDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Saving…" : "Save profile"}
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
  validationBanner: {
    backgroundColor: "#fff4d6",
    borderRadius: 12,
    padding: 12,
  },
  validationText: { color: "#8a6000", fontWeight: "600" },
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
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
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
    gap: 16,
  },
  switchHint: { fontSize: 14, color: "#666", lineHeight: 20 },
  saveButton: {
    backgroundColor: "#ff4f81",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  saveDisabled: { opacity: 0.5 },
  signOutButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
  },
  signOutText: { color: "#444", fontSize: 15, fontWeight: "600" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  centeredText: { fontSize: 16, color: "#444" },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  segmentButtonActive: {
    backgroundColor: "#ffedf3",
    borderColor: "#ff4f81",
  },
  segmentText: { color: "#444", fontSize: 14, fontWeight: "500" },
  segmentTextActive: { color: "#ff4f81" },
});
