import { useCallback, useEffect, useState } from "react";
import {
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
import { Profile } from "../../src/lib/types";
import { useAuth } from "../../src/store/useAuth";
import { useProfile } from "../../src/store/useProfile";
import { useMatches } from "../../src/store/useMatches";

const emptyPrompt = { question: "", answer: "" };
const defaultPrompts = [
  { ...emptyPrompt },
  { ...emptyPrompt },
  { ...emptyPrompt },
];

export default function ProfileScreen() {
  const auth = useAuth((state) => state.user);
  const signOut = useAuth((state) => state.signOut);
  const profile = useProfile((state) => state.profile);
  const loadProfile = useProfile((state) => state.load);
  const saveProfile = useProfile((state) => state.save);
  const setPro = useProfile((state) => state.setPro);
  const resetProfile = useProfile((state) => state.reset);
  const resetMatches = useMatches((state) => state.reset);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [personaSeed, setPersonaSeed] = useState("");
  const [hobbiesText, setHobbiesText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [prompts, setPrompts] = useState(defaultPrompts);

  useFocusEffect(
    useCallback(() => {
      if (auth?.id) {
        loadProfile(auth.id);
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
    const nextPrompts = profile.prompts.length
      ? profile.prompts
      : defaultPrompts;
    setPrompts([
      nextPrompts[0] ?? { ...emptyPrompt },
      nextPrompts[1] ?? { ...emptyPrompt },
      nextPrompts[2] ?? { ...emptyPrompt },
    ]);
  }, [profile]);

  const handleSave = async () => {
    if (!auth) return;
    if (!name.trim() || !bio.trim()) {
      Alert.alert("Missing info", "Name and bio are required.");
      return;
    }
    const parsedAge = age.trim() ? Number(age) : undefined;
    if (parsedAge && Number.isNaN(parsedAge)) {
      Alert.alert("Invalid age", "Age must be a number.");
      return;
    }
    const cleanedPrompts = prompts
      .filter((item) => item.question.trim() && item.answer.trim())
      .map((item) => ({
        question: item.question.trim(),
        answer: item.answer.trim(),
      }));
    const profilePayload: Profile = {
      userId: auth.id,
      name: name.trim(),
      age: parsedAge,
      bio: bio.trim(),
      personaSeed: personaSeed.trim() || "Friendly and curious.",
      prompts: cleanedPrompts,
      hobbies: hobbiesText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      photoURIs: photos,
      isPro: profile?.isPro ?? false,
    };
    await saveProfile(profilePayload);
    Alert.alert("Saved", "Profile updated.");
  };

  const handleSignOut = async () => {
    resetMatches();
    resetProfile();
    await signOut();
  };

  if (!auth) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Sign in to edit your profile.</Text>
      </View>
    );
  }

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to add pictures.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((item) => item !== uri));
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.heading}>Your Profile</Text>
      <TextInput
        placeholder="Name"
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        placeholder="Age (optional)"
        value={age}
        onChangeText={setAge}
        keyboardType="number-pad"
        style={styles.input}
      />
      <TextInput
        placeholder="Bio"
        value={bio}
        onChangeText={setBio}
        multiline
        style={[styles.input, styles.textArea]}
      />
      <TextInput
        placeholder="Persona seed (helps AI replies)"
        value={personaSeed}
        onChangeText={setPersonaSeed}
        multiline
        style={[styles.input, styles.textArea]}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prompts</Text>
        {prompts.map((prompt, index) => (
          <View key={`prompt-${index}`} style={styles.promptBlock}>
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
              style={styles.input}
            />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hobbies (comma separated)</Text>
        <TextInput
          placeholder="Climbing, Cooking, Photography"
          value={hobbiesText}
          onChangeText={setHobbiesText}
          style={styles.input}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>
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
          <TouchableOpacity
            style={styles.addPhotoCard}
            onPress={handleAddPhoto}
          >
            <Text style={styles.addPhotoIcon}>＋</Text>
            <Text style={styles.addPhotoLabel}>Add</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Wingmate Autopilot</Text>
          <Text style={styles.switchHint}>
            Let Wingmate craft replies and suggest plans for you.
          </Text>
        </View>
        <Switch
          value={profile?.isPro ?? false}
          onValueChange={(value) => {
            if (auth?.id) {
              setPro(auth.id, value);
            }
          }}
          trackColor={{ true: "#ff9fb5", false: "#ccc" }}
          thumbColor={(profile?.isPro ?? false) ? "#ff4f81" : "#f4f3f4"}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      <View style={{ height: 32 }} />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#222",
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoThumbWrapper: {
    position: "relative",
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
  },
  removePhotoButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 999,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  removePhotoText: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 18,
  },
  addPhotoCard: {
    width: 96,
    height: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoIcon: {
    fontSize: 24,
    color: "#ff4f81",
    lineHeight: 28,
  },
  addPhotoLabel: {
    fontSize: 12,
    color: "#ff4f81",
    marginTop: 4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  switchHint: {
    color: "#666",
    marginTop: 4,
  },
  promptBlock: {
    gap: 12,
  },
  saveButton: {
    backgroundColor: "#ff4f81",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  signOutButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  signOutText: {
    fontSize: 16,
    color: "#444",
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  centeredText: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
  },
});
