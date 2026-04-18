import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { Upload, Edit2, Music, Palette, Video, Check, Trash2 } from "lucide-react";
import { ArchiveLoadingState } from "./archive-loading-state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProfileArchiveView } from "./profile-archive-view";
import { LikedTracksPanel } from "./liked-tracks-panel";
import { attachPublicMediaSlugs, buildPublicMediaPath } from "@/lib/media-slugs";
import { CONTENT_SWAP_ANIMATION, PAGE_TRANSITION, PROFILE_PANEL_SWAP_ANIMATION } from "@/lib/motion";
import { uploadMediaDirectToSupabase } from "@/lib/upload-request";

const ChangePasswordModal = dynamic(
  () => import("./change-password-modal").then((mod) => mod.ChangePasswordModal),
  { ssr: false },
);
const UploadContentModal = dynamic(
  () => import("./upload-content-modal").then((mod) => mod.UploadContentModal),
  { ssr: false },
);
const UploadProgressModal = dynamic(
  () => import("./upload-progress-modal").then((mod) => mod.UploadProgressModal),
  { ssr: false },
);
const EditUploadModal = dynamic(
  () => import("./edit-upload-modal").then((mod) => mod.EditUploadModal),
  { ssr: false },
);
const ImageCropModal = dynamic(
  () => import("./image-crop-modal").then((mod) => mod.ImageCropModal),
  { ssr: false },
);
const UploadCategoryModal = dynamic(
  () => import("./upload-category-modal").then((mod) => mod.UploadCategoryModal),
  { ssr: false },
);
const MediaItemPage = dynamic(
  () => import("./media-item-page").then((mod) => mod.MediaItemPage),
  { ssr: false },
);
const VisualGalleryLightbox = dynamic(
  () => import("./visual-gallery-lightbox").then((mod) => mod.VisualGalleryLightbox),
  { ssr: false },
);
const ProfileConnectionsModal = dynamic(
  () => import("./profile-connections-modal").then((mod) => mod.ProfileConnectionsModal),
  { ssr: false },
);

const PROFILE_DETAIL_HISTORY_KEY = "__omaProfileDetail";

function isGeneratedUsername(username) {
  return typeof username === "string" && /_[a-f0-9]{8}$/.test(username);
}

function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function sortReleaseTracks(a, b) {
  const firstTrackNumber = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
  const secondTrackNumber = b.trackNumber ?? Number.MAX_SAFE_INTEGER;

  if (firstTrackNumber !== secondTrackNumber) {
    return firstTrackNumber - secondTrackNumber;
  }

  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

export function MyProfile({
  onBack,
  likedTracks = [],
  forceSetup = false,
  onSetupComplete,
  navigationIntent = "",
  onNavigationIntentHandled,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onAddTrackToQueue,
  onTrackDeleted,
  onMediaItemUpdated,
  currentTime,
  duration,
  onSeekTrack,
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const avatarInputRef = useRef(null);
  const [isEditing, setIsEditing] = useState(forceSetup);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingMedia, setIsLoadingMedia] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(12);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUploadCategoryModal, setShowUploadCategoryModal] = useState(false);
  const [editingMediaItem, setEditingMediaItem] = useState(null);
  const [selectedMediaItem, setSelectedMediaItem] = useState(null);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState(null);
  const [lightboxState, setLightboxState] = useState({ kind: "", index: -1 });
  const [connectionsView, setConnectionsView] = useState(null);
  const [uploadKind, setUploadKind] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUpdatingMedia, setIsUpdatingMedia] = useState(false);
  const [deleteAccountConfirmStep, setDeleteAccountConfirmStep] = useState(0);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deletingMediaItemId, setDeletingMediaItemId] = useState(null);
  const [profileNotice, setProfileNotice] = useState({ type: "", message: "" });
  const [contentNotice, setContentNotice] = useState({ type: "", message: "" });
  const [mediaItems, setMediaItems] = useState([]);
  const normalizedLikedTracks = Array.isArray(likedTracks) ? likedTracks : [];
  const [profileData, setProfileData] = useState({
    username: '',
    email: '',
    displayName: '',
    bio: '',
    avatar: '',
    followerCount: 0,
    followingCount: 0,
    categoryTags: [],
  });
  const [emailChangeData, setEmailChangeData] = useState({
    currentEmail: "",
    newEmail: "",
  });
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const isEditMode = forceSetup || isEditing;
  const mediaItemsWithSlugs = useMemo(() => attachPublicMediaSlugs(mediaItems), [mediaItems]);
const musicItems = useMemo(
  () => mediaItemsWithSlugs.filter((item) => item.mediaKind === "music"),
  [mediaItemsWithSlugs],
);
const visualItems = useMemo(
  () => mediaItemsWithSlugs.filter((item) => item.mediaKind === "visual"),
  [mediaItemsWithSlugs],
);
const videoItems = useMemo(
  () => mediaItemsWithSlugs.filter((item) => item.mediaKind === "video"),
  [mediaItemsWithSlugs],
);
const lightboxItems = lightboxState.kind === "video" ? videoItems : visualItems;
useEffect(() => {
  if (
    !editingMediaItem ||
    editingMediaItem.releaseType === "single" ||
    !editingMediaItem.collectionId
  ) {
    return;
  }

  const releaseTracks = musicItems
    .filter((musicItem) => musicItem.collectionId === editingMediaItem.collectionId)
    .sort(sortReleaseTracks);

  const currentIds = (editingMediaItem.releaseTracks || []).map((track) => track.id).join(",");
  const nextIds = releaseTracks.map((track) => track.id).join(",");

  if (currentIds !== nextIds) {
    setEditingMediaItem((current) => (current ? { ...current, releaseTracks } : current));
  }
}, [editingMediaItem, musicItems]);
  const activeMusicItemId = currentTrack?.track?.id || null;
  const artistIdentity = {
    name: profileData.displayName || profileData.username || "artist",
    username: profileData.username,
  };

  const openUploadCategoryPicker = () => {
    setShowUploadCategoryModal(true);
  };

  const openUploadForKind = (mediaKind) => {
    setContentNotice({ type: "", message: "" });
    setShowUploadCategoryModal(false);
    setUploadKind(mediaKind);
    setShowUploadModal(true);
  };

  useEffect(() => {
    if (!selectedMediaItem) {
      return;
    }

    const nextSelectedItem = mediaItemsWithSlugs.find((item) => item.id === selectedMediaItem.id);
    if (!nextSelectedItem) {
      setSelectedMediaItem(null);
      return;
    }

    if (nextSelectedItem !== selectedMediaItem) {
      setSelectedMediaItem(nextSelectedItem);
    }
  }, [mediaItemsWithSlugs, selectedMediaItem]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePopState = (event) => {
      const state = event.state;
      if (state?.[PROFILE_DETAIL_HISTORY_KEY]) {
        return;
      }

      setSelectedMediaItem(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleIntent = (intent) => {
      if (intent === "settings") {
        setIsEditing(true);
        return true;
      }

      if (intent === "upload") {
        openUploadCategoryPicker();
        return true;
      }

      return false;
    };

    const consumeHashIntent = () => {
      const intent = window.location.hash.replace(/^#/, "").trim().toLowerCase();
      if (!handleIntent(intent)) {
        return;
      }

      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    };

    consumeHashIntent();
    window.addEventListener("hashchange", consumeHashIntent);

    return () => {
      window.removeEventListener("hashchange", consumeHashIntent);
    };
  }, [profileData.categoryTags]);

  useEffect(() => {
    if (!navigationIntent) {
      return;
    }

    if (navigationIntent === "settings") {
      setIsEditing(true);
      onNavigationIntentHandled?.();
      return;
    }

    if (navigationIntent === "upload") {
      openUploadCategoryPicker();
      onNavigationIntentHandled?.();
    }
  }, [navigationIntent, onNavigationIntentHandled, profileData.categoryTags]);

  const toggleCategoryTag = (tag) => {
    if (profileData.categoryTags.includes(tag)) {
      setProfileData({
        ...profileData,
        categoryTags: profileData.categoryTags.filter(t => t !== tag)
      });
    } else {
      setProfileData({
        ...profileData,
        categoryTags: [...profileData.categoryTags, tag]
      });
    }
  };

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      const startedAt = Date.now();
      setIsLoadingProfile(true);
      setIsLoadingMedia(true);
      setLoadingProgress(12);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (!session?.access_token) {
        setProfileNotice({ type: "error", message: "Session expired. Please sign in again." });
        setLoadingProgress(100);
        setIsLoadingProfile(false);
        setIsLoadingMedia(false);
        return;
      }

      setLoadingProgress(24);

      const [authUser, profileResponse, mediaResponse] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/api/profile", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
        fetch("/api/media", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
      ]);

      if (!mounted) return;

      setLoadingProgress(58);

      const currentEmail = authUser?.data?.user?.email || "";
      if (!profileResponse.ok) {
        const payload = await profileResponse.json().catch(() => ({}));
        setProfileNotice({ type: "error", message: payload?.error || "Failed to load profile." });
        setLoadingProgress(100);
        setIsLoadingProfile(false);
        setIsLoadingMedia(false);
        return;
      }

      const payload = await profileResponse.json();
      const apiProfile = payload?.profile;

      setProfileData((prev) => ({
        ...prev,
        username: apiProfile?.username || "",
        displayName: apiProfile?.displayName || "",
        bio: apiProfile?.bio || "",
        avatar: apiProfile?.avatarUrl || "",
        followerCount: apiProfile?.followerCount || 0,
        followingCount: apiProfile?.followingCount || 0,
        categoryTags: apiProfile?.categoryTags || [],
        email: currentEmail,
      }));
      setEmailChangeData({
        currentEmail: "",
        newEmail: "",
      });
      setIsChangingEmail(false);

      if (!mediaResponse.ok) {
        const mediaPayload = await mediaResponse.json().catch(() => ({}));
        setContentNotice({
          type: "error",
          message: mediaPayload?.error || "Failed to load your uploaded content.",
        });
        setMediaItems([]);
      } else {
        const mediaPayload = await mediaResponse.json();
        setMediaItems(mediaPayload?.items || []);
      }

      setLoadingProgress(100);

      const elapsed = Date.now() - startedAt;
      const minLoadDuration = 560;
      if (elapsed < minLoadDuration) {
        await new Promise((resolve) => setTimeout(resolve, minLoadDuration - elapsed));
      }

      if (!mounted) return;

      setIsLoadingProfile(false);
      setIsLoadingMedia(false);
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  const handleSaveProfile = async () => {
    setProfileNotice({ type: "", message: "" });
    setIsSaving(true);

    const normalizedUsername = profileData.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
      setProfileNotice({
        type: "error",
        message: "Username must be 3-32 characters using lowercase letters, numbers, or underscores.",
      });
      setIsSaving(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setProfileNotice({ type: "error", message: "Could not verify your session. Please sign in again." });
      setIsSaving(false);
      return;
    }

    const profileResponse = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        username: normalizedUsername,
        displayName: profileData.displayName.trim() || normalizedUsername,
        bio: profileData.bio,
        categoryTags: profileData.categoryTags,
      }),
    });

    const profilePayload = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok) {
      const rawError = String(profilePayload?.error || "");
      const uniqueUsername = rawError.toLowerCase().includes("profiles_username_key");
      setProfileNotice({
        type: "error",
        message: uniqueUsername
          ? "That username is already taken. Please choose another."
          : profilePayload?.error || "Failed to save profile.",
      });
      setIsSaving(false);
      return;
    }

    setProfileData((prev) => ({
      ...prev,
      username: profilePayload?.profile?.username || prev.username,
      displayName: profilePayload?.profile?.displayName || prev.displayName,
      bio: profilePayload?.profile?.bio || "",
      avatar: profilePayload?.profile?.avatarUrl ?? prev.avatar,
      followerCount: profilePayload?.profile?.followerCount ?? prev.followerCount,
      followingCount: profilePayload?.profile?.followingCount ?? prev.followingCount,
      categoryTags: profilePayload?.profile?.categoryTags || [],
    }));

    const { data: userData, error: getUserError } = await supabase.auth.getUser();
    if (getUserError || !userData?.user) {
      setProfileNotice({ type: "success", message: "Profile saved." });
      setIsEditing(false);
      setIsSaving(false);
      return;
    }

    const currentEmail = userData.user.email || "";
    const submittedCurrentEmail = emailChangeData.currentEmail.trim().toLowerCase();
    const nextEmail = emailChangeData.newEmail.trim().toLowerCase();
    const isEmailChangeRequested = Boolean(submittedCurrentEmail || nextEmail);

    if (isEmailChangeRequested) {
      if (!submittedCurrentEmail || !nextEmail) {
        setProfileNotice({
          type: "error",
          message: "Enter both your current email and the new email you want to use.",
        });
        setIsSaving(false);
        return;
      }

      if (!isValidEmailAddress(nextEmail)) {
        setProfileNotice({
          type: "error",
          message: "Enter a valid new email address.",
        });
        setIsSaving(false);
        return;
      }

      if (submittedCurrentEmail !== currentEmail.toLowerCase()) {
        setProfileNotice({
          type: "error",
          message: "Current email does not match the account you are signed into.",
        });
        setIsSaving(false);
        return;
      }

      if (nextEmail === currentEmail.toLowerCase()) {
        setProfileNotice({
          type: "error",
          message: "Enter a different new email address.",
        });
        setIsSaving(false);
        return;
      }

      const { error: emailUpdateError } = await supabase.auth.updateUser({ email: nextEmail });
      if (emailUpdateError) {
        setProfileNotice({ type: "error", message: emailUpdateError.message || "Failed to update email." });
        setIsSaving(false);
        return;
      }

      setEmailChangeData({
        currentEmail: "",
        newEmail: "",
      });
      setIsChangingEmail(false);
      setProfileNotice({
        type: "success",
        message: "Profile saved. Check the new email inbox to confirm the change.",
      });
    } else {
      setProfileNotice({ type: "success", message: "Profile saved." });
    }

    if (forceSetup && !isGeneratedUsername(normalizedUsername)) {
      onSetupComplete?.();
    }

    setIsEditing(false);
    setIsSaving(false);
  };

  const handleDeleteAccount = async () => {
    setProfileNotice({ type: "", message: "" });

    if (deleteAccountConfirmStep < 1) {
      setDeleteAccountConfirmStep(1);
      setProfileNotice({
        type: "error",
        message: "Click delete account again to permanently remove your account and uploads.",
      });
      return;
    }

    setIsDeletingAccount(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setProfileNotice({ type: "error", message: "Session expired. Please sign in again." });
        return;
      }

      const response = await fetch("/api/profile", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProfileNotice({ type: "error", message: payload?.error || "Failed to delete account." });
        return;
      }

      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        window.location.assign("/");
      }
    } catch (error) {
      setProfileNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete account.",
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const categories = [
    { id: 'music', label: 'Music', icon: Music, description: 'audio releases & tracks' },
    { id: 'visual', label: 'Visual', icon: Palette, description: 'artwork & photography' },
    { id: 'video', label: 'Video', icon: Video, description: 'films & motion graphics' },
  ];

  const openUploadModal = (mediaKind) => {
    openUploadForKind(mediaKind);
  };

  const openAvatarPicker = () => {
    if (isUploadingAvatar) return;
    avatarInputRef.current?.click();
  };

  const closeUploadModal = () => {
    if (isUploading) return;
    setShowUploadModal(false);
    setUploadKind(null);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatUploadDate = (value) => {
    if (!value) return "";
    return new Date(value).toLocaleDateString();
  };

  const formatReleaseType = (value) => {
    if (value === "ep") return "EP";
    if (value === "album") return "Album";
    return "Single";
  };

  const uploadAvatarFile = async (file) => {
    setIsUploadingAvatar(true);
    setProfileNotice({ type: "", message: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setProfileNotice({
          type: "error",
          message: "Session expired. Please sign in again before uploading an avatar.",
        });
        return;
      }

      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProfileNotice({
          type: "error",
          message: payload?.error || "Failed to upload avatar.",
        });
        return;
      }

      setProfileData((prev) => ({
        ...prev,
        avatar: payload?.avatar?.url || "",
      }));
      setAvatarDraft(null);
      setProfileNotice({
        type: "success",
        message: "Avatar updated.",
      });
    } catch (error) {
      setProfileNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to upload avatar.",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setAvatarDraft(file);
  };

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true);
    setProfileNotice({ type: "", message: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setProfileNotice({
          type: "error",
          message: "Session expired. Please sign in again before removing your avatar.",
        });
        return;
      }

      const response = await fetch("/api/profile/avatar", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProfileNotice({
          type: "error",
          message: payload?.error || "Failed to remove avatar.",
        });
        return;
      }

      setProfileData((prev) => ({
        ...prev,
        avatar: "",
      }));
      setProfileNotice({
        type: "success",
        message: "Avatar removed.",
      });
    } catch (error) {
      setProfileNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to remove avatar.",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUploadContent = async ({
    mediaKind,
    releaseType,
    title,
    description,
    visibility,
    file,
    files,
    trackTitles,
    coverArt,
  }) => {
    setIsUploading(true);
    setUploadProgress(1);
    setContentNotice({ type: "", message: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setContentNotice({
          type: "error",
          message: "Session expired. Please sign in again before uploading.",
        });
        return;
      }

      const payload = await uploadMediaDirectToSupabase({
        token: session.access_token,
        mediaKind,
        releaseType,
        title,
        description,
        visibility,
        file,
        files,
        trackTitles,
        coverArt,
        onProgress: setUploadProgress,
      });

      const newItems = Array.isArray(payload.items)
        ? payload.items
        : payload.item
          ? [payload.item]
          : [];
      const hydratedNewItems = newItems.map((item) => ({
        likes: 0,
        comments: 0,
        isLiked: false,
        ...item,
      }));
      setMediaItems((current) => [...hydratedNewItems, ...current]);
      setContentNotice({
        type: "success",
        message:
          mediaKind === "music" && releaseType !== "single" && newItems.length > 1
            ? `${newItems.length} tracks uploaded to ${title}.`
            : mediaKind === "music" && releaseType
              ? `${title} uploaded as a ${formatReleaseType(releaseType).toLowerCase()}.`
              : `${title} uploaded successfully.`,
      });
      setShowUploadModal(false);
      setUploadKind(null);
    } catch (error) {
      setContentNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteMediaItem = async (mediaItemId, options = {}) => {
    setDeletingMediaItemId(mediaItemId);
    setContentNotice({ type: "", message: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setContentNotice({
          type: "error",
          message: "Session expired. Please sign in again before deleting content.",
        });
        return false;
      }

      const deleteUrl = `/api/media?id=${encodeURIComponent(mediaItemId)}${
        options.scope === "release" ? "&scope=release" : ""
      }`;
      const response = await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setContentNotice({
          type: "error",
          message: payload?.error || "Failed to delete content.",
        });
        return false;
      }

      const deletedIds = Array.isArray(payload?.ids) && payload.ids.length > 0 ? payload.ids : [mediaItemId];
      const deletedIdSet = new Set(deletedIds);

      setMediaItems((current) => current.filter((item) => !deletedIdSet.has(item.id)));
      if (currentTrack?.track?.id && deletedIdSet.has(currentTrack.track.id)) {
        onTrackDeleted?.(mediaItemId);
      }
      if (editingMediaItem?.id && deletedIdSet.has(editingMediaItem.id)) {
        setEditingMediaItem(null);
      }
      if (selectedMediaItem?.id && deletedIdSet.has(selectedMediaItem.id)) {
        setSelectedMediaItem(null);
      }
      setContentNotice({
        type: "success",
        message: "Content deleted.",
      });
      return true;
    } catch (error) {
      setContentNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to delete content.",
      });
      return false;
    } finally {
      setDeletingMediaItemId(null);
    }
  };

  const handleSaveMediaItem = async ({ id, title, description, visibility, coverArt }) => {
    setIsUpdatingMedia(true);
    setContentNotice({ type: "", message: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setContentNotice({
          type: "error",
          message: "Session expired. Please sign in again before editing content.",
        });
        return;
      }

        const body = new FormData();
        body.append("id", id);
        body.append("title", title);
        body.append("description", description);
        body.append("visibility", visibility);
        if (coverArt instanceof File) {
          body.append("coverArt", coverArt);
        }

        const response = await fetch("/api/media", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body,
        });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setContentNotice({
          type: "error",
          message: payload?.error || "Failed to update content.",
        });
        return;
      }

      let mergedItem = payload.item;
      setMediaItems((current) =>
        current.map((item) => {
          if (item.id !== id) {
            return item;
          }

          mergedItem = {
            ...item,
            ...payload.item,
            likes: item.likes || 0,
            comments: item.comments || 0,
            isLiked: Boolean(item.isLiked),
          };
          return mergedItem;
        }),
      );
      if (selectedMediaItem?.id === id) {
        setSelectedMediaItem(mergedItem);
      }
      onMediaItemUpdated?.(mergedItem);
      setEditingMediaItem(null);
      setContentNotice({
        type: "success",
        message: "Upload updated.",
      });
    } catch (error) {
      setContentNotice({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update content.",
      });
    } finally {
      setIsUpdatingMedia(false);
    }
  };

  const handlePlayMusicItem = (item, preferredQueueItems) => {
    if (!item?.asset?.url || !onPlayTrack) {
      return;
    }

    const releaseQueueItems = item.collectionId
      ? musicItems.filter((musicItem) => musicItem.collectionId === item.collectionId).sort(sortReleaseTracks)
      : musicItems;
    onPlayTrack(item, artistIdentity, preferredQueueItems || releaseQueueItems);
  };

  const handleSeekMusicItem = (item, nextTime) => {
    if (activeMusicItemId !== item.id || !onSeekTrack) {
      return;
    }

    onSeekTrack(nextTime);
  };

  const openEditUploadModal = (item) => {
    const isMultiTrackRelease =
      item?.mediaKind === "music" &&
      item?.collectionId &&
      item?.releaseType &&
      item.releaseType !== "single";

    let releaseTracks = null;
    if (isMultiTrackRelease) {
      releaseTracks = musicItems
        .filter((musicItem) => musicItem.collectionId === item.collectionId)
        .sort(sortReleaseTracks);
    }

    setEditingMediaItem(releaseTracks ? { ...item, releaseTracks } : item);
  };

  const handleMediaSocialUpdate = (mediaItemId, socialUpdate) => {
    setMediaItems((current) =>
      current.map((item) =>
        item.id === mediaItemId
          ? {
              ...item,
              ...socialUpdate,
            }
          : item,
      ),
    );

    setSelectedMediaItem((current) =>
      current?.id === mediaItemId
        ? {
            ...current,
            ...socialUpdate,
          }
        : current,
    );
  };

  const handleAddMusicItemToQueue = (item) => {
    if (!item?.asset?.url || !onAddTrackToQueue) {
      return;
    }

    const result = onAddTrackToQueue(item, artistIdentity, musicItems);
    setContentNotice({
      type: "success",
      message: result === "exists" ? "Track is already in the queue." : "Track added to queue.",
    });
  };

  const handleShareMusicItem = (item) => {
    const publicSharePath =
      profileData.username &&
      item.slug &&
      (item.visibility === "public" || item.visibility === "unlisted")
        ? buildPublicMediaPath(profileData.username, item.slug)
        : "";
    const shareUrl =
      typeof window !== "undefined"
        ? publicSharePath
          ? `${window.location.origin}${publicSharePath}`
          : `${window.location.origin}${window.location.pathname}#track-${item.id}`
        : "";

    return shareUrl;
  };

  const openMediaItemPage = (item) => {
    const hasPublicMediaRoute =
      !forceSetup &&
      profileData.username &&
      !isGeneratedUsername(profileData.username) &&
      item?.slug;

    if (hasPublicMediaRoute) {
      router.push(buildPublicMediaPath(profileData.username, item.slug));
      return;
    }

    if (typeof window !== "undefined") {
      const nextState = {
        ...(window.history.state || {}),
        [PROFILE_DETAIL_HISTORY_KEY]: item.id,
      };

      if (selectedMediaItem?.id) {
        window.history.replaceState(nextState, "", window.location.href);
      } else {
        window.history.pushState(nextState, "", window.location.href);
      }
    }

    setSelectedMediaItem(item);
  };

  const closeMediaItemPage = () => {
    if (typeof window !== "undefined" && window.history.state?.[PROFILE_DETAIL_HISTORY_KEY]) {
      window.history.back();
      return;
    }

    setSelectedMediaItem(null);
  };

  const isInitialArchiveLoading = (isLoadingProfile || isLoadingMedia) && !selectedMediaItem && !isEditMode;
  const isInitialEditLoading = (isLoadingProfile || isLoadingMedia) && isEditMode;

  const openVisualLightbox = (item) => {
    const nextIndex = visualItems.findIndex((entry) => entry.id === item.id);
    if (nextIndex !== -1) {
      setLightboxState({ kind: "visual", index: nextIndex });
    }
  };

  const openVideoLightbox = (item) => {
    const nextIndex = videoItems.findIndex((entry) => entry.id === item.id);
    if (nextIndex !== -1) {
      setLightboxState({ kind: "video", index: nextIndex });
    }
  };

  const handleProfileBack = () => {
    if (isNavigatingBack) {
      return;
    }

    setIsNavigatingBack(true);
    window.setTimeout(() => {
      onBack?.();
    }, 260);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={
        isNavigatingBack
          ? { opacity: 0, y: -16, scale: 0.992, filter: "blur(8px)" }
          : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
      }
      transition={PAGE_TRANSITION}
    >
      {!forceSetup && (
        <motion.button
          onClick={handleProfileBack}
          disabled={isNavigatingBack}
          className="mb-6 md:mb-8 text-gray-400 hover:text-white transition-colors relative group inline-block touch-manipulation"
          whileHover={{ x: -5 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="inline-block" aria-hidden="true">{"\u2190"}</span>
          <span className="ml-2">back</span>
          <motion.div
            className="absolute -bottom-1 left-0 h-px bg-white"
            initial={{ width: 0 }}
            whileHover={{ width: "100%" }}
            transition={{ duration: 0.3 }}
          />
        </motion.button>
      )}

      {isEditMode && (
        <div className="mb-8 md:mb-12">
          <h2 className="text-3xl md:text-4xl">account settings</h2>
        </div>
      )}

      {profileNotice.message && (
        <div
          className={`mb-6 border px-4 py-3 text-sm ${
            profileNotice.type === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-green-500/40 bg-green-500/10 text-green-400"
          }`}
        >
          {profileNotice.message}
        </div>
      )}

      {forceSetup && (
        <div className="mb-6 border border-white/20 bg-white/5 px-4 py-3 text-sm text-gray-300">
          Account setup: choose a unique @username to continue. Bio and profile image are optional.
        </div>
      )}

      <AnimatePresence mode="wait">
        {isEditMode ? (
          // EDIT MODE
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isInitialEditLoading ? (
                <motion.div
                  key="profile-edit-loading"
                  {...CONTENT_SWAP_ANIMATION}
                  transition={PAGE_TRANSITION}
                >
                  <ArchiveLoadingState
                    label="profile setup"
                    progress={loadingProgress}
                  />
                </motion.div>
              ) : (
            <motion.div
              key="profile-edit-content"
              className="border border-white/20 p-4 md:p-8 mb-12"
              {...CONTENT_SWAP_ANIMATION}
              transition={PAGE_TRANSITION}
            >
              <div className="flex flex-col md:flex-row items-start gap-6 md:gap-8 mb-8">
                {/* Avatar Upload */}
                <div className="mx-auto flex w-full max-w-[18rem] flex-col items-center md:mx-0 md:w-auto md:max-w-none md:flex-shrink-0 md:items-start">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarSelected}
                  />
                  <button
                    type="button"
                    onClick={openAvatarPicker}
                    disabled={isUploadingAvatar}
                    className="group relative flex h-32 w-32 touch-manipulation items-center justify-center overflow-hidden rounded-full border-2 border-white/20 bg-gradient-to-br from-gray-800 to-gray-900 transition-all hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-70 md:h-48 md:w-48"
                  >
                    {profileData.avatar ? (
                      <>
                        <img
                          src={profileData.avatar}
                          alt="Profile"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                          <div className="text-center">
                            <Upload className="mx-auto h-6 w-6 md:h-8 md:w-8" />
                            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/80">
                              {isUploadingAvatar ? "uploading..." : "change"}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-6 md:p-8">
                        <Upload className="mx-auto mb-2 h-6 w-6 text-gray-500 md:h-8 md:w-8" />
                        <p className="text-xs text-gray-500">
                          {isUploadingAvatar ? "uploading..." : "upload avatar"}
                        </p>
                      </div>
                    )}
                  </button>
                  <div
                    className={`mt-3 grid w-full items-center justify-items-center gap-2 md:block md:w-auto md:text-left ${
                      profileData.avatar ? "grid-cols-1" : "grid-cols-1"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={openAvatarPicker}
                      disabled={isUploadingAvatar}
                      className="whitespace-nowrap text-xs uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-70 md:inline"
                    >
                      {profileData.avatar ? "replace image" : "choose image"}
                    </button>
                    {profileData.avatar && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={isUploadingAvatar}
                        className="whitespace-nowrap text-xs uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-70 md:ml-4 md:inline"
                      >
                        remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1 w-full">
                  {/* Username Field */}
                  <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-2">
                      username
                      <span className="text-gray-500 ml-2 text-xs">(unique identifier)</span>
                    </label>
                    <input
                      type="text"
                      value={profileData.username}
                      onChange={(e) => setProfileData({ ...profileData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                      placeholder="username"
                      className="w-full bg-transparent border border-white/20 px-4 py-3 focus:border-white/60 focus:outline-none transition-colors"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      lowercase letters, numbers, and underscores only
                    </p>
                  </div>

                  {/* Display Name Field */}
                  <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-2">
                      display name
                      <span className="text-gray-500 ml-2 text-xs">(band, collective, or your name)</span>
                    </label>
                    <input
                      type="text"
                      value={profileData.displayName}
                      onChange={(e) => setProfileData({ ...profileData, displayName: e.target.value })}
                      placeholder="display name"
                      className="w-full bg-transparent border border-white/20 px-4 py-3 focus:border-white/60 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-2">
                      account email
                      <span className="text-gray-500 ml-2 text-xs">(current sign-in address)</span>
                    </label>
                    <div className="w-full border border-white/10 bg-white/[0.03] px-4 py-3 text-white/60">
                      {profileData.email || "no email loaded"}
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangingEmail((current) => !current);
                          if (isChangingEmail) {
                            setEmailChangeData({
                              currentEmail: "",
                              newEmail: "",
                            });
                          }
                        }}
                        className="text-xs uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-white"
                      >
                        {isChangingEmail ? "cancel email change" : "change email"}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isChangingEmail ? (
                      <motion.div
                        layout
                        className="mb-6 border border-white/10 bg-white/[0.02] p-4 md:p-5"
                        initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                        transition={PAGE_TRANSITION}
                      >
                        <div className="mb-5">
                          <label className="block text-sm text-gray-400 mb-2">
                            current email
                            <span className="text-gray-500 ml-2 text-xs">(required to confirm change)</span>
                          </label>
                          <input
                            type="email"
                            value={emailChangeData.currentEmail}
                            onChange={(e) =>
                              setEmailChangeData((current) => ({
                                ...current,
                                currentEmail: e.target.value,
                              }))
                            }
                            placeholder="enter current email"
                            className="w-full bg-transparent border border-white/20 px-4 py-3 focus:border-white/60 focus:outline-none transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm text-gray-400 mb-2">
                            new email
                            <span className="text-gray-500 ml-2 text-xs">(confirmation goes here)</span>
                          </label>
                          <input
                            type="email"
                            value={emailChangeData.newEmail}
                            onChange={(e) =>
                              setEmailChangeData((current) => ({
                                ...current,
                                newEmail: e.target.value,
                              }))
                            }
                            placeholder="enter new email"
                            className="w-full bg-transparent border border-white/20 px-4 py-3 focus:border-white/60 focus:outline-none transition-colors"
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            This change will stay pending until the new email is confirmed.
                          </p>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className="mb-6">
                    <label className="block text-sm text-gray-400 mb-2">bio</label>
                    <textarea
                      value={profileData.bio}
                      onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                      placeholder="add your bio..."
                      rows={4}
                      className="w-full bg-transparent border border-white/20 px-4 py-3 focus:border-white/60 focus:outline-none transition-colors resize-none"
                    />
                  </div>

                </div>
              </div>

              {/* Change Password */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <motion.button
                  onClick={() => setShowChangePassword(true)}
                  className="border border-white/40 px-6 py-2 hover:border-white/60 hover:bg-white/10 transition-all duration-300 text-sm relative group touch-manipulation"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="tracking-wide">change password</span>
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"
                    initial={{ scaleX: 0 }}
                    whileHover={{ scaleX: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                </motion.button>
              </div>

              {/* Category Tags Section */}
              <div className="border-t border-white/10 pt-6 mt-6">
                <h4 className="text-lg mb-2">content categories</h4>
                <p className="text-sm text-gray-400 mb-6">
                  select the type(s) of content you create. your profile will appear in these browse categories.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {categories.map((category) => {
                    const Icon = category.icon;
                    const isSelected = profileData.categoryTags.includes(category.id);
                    
                    return (
                      <motion.button
                        key={category.id}
                        onClick={() => toggleCategoryTag(category.id)}
                        className={`relative border-2 p-6 transition-all duration-300 group touch-manipulation ${
                          isSelected 
                            ? 'border-white bg-white/10' 
                            : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Check indicator */}
                        {isSelected && (
                          <motion.div
                            className="absolute top-3 right-3"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          >
                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                              <Check className="w-4 h-4 text-black" strokeWidth={3} />
                            </div>
                          </motion.div>
                        )}

                        {/* Icon */}
                        <div className="flex justify-center mb-4">
                          <Icon className={`w-10 h-10 transition-colors ${
                            isSelected ? 'text-white' : 'text-gray-400'
                          }`} strokeWidth={1.5} />
                        </div>

                        {/* Label */}
                        <h5 className={`text-lg mb-1 transition-colors ${
                          isSelected ? 'text-white' : 'text-gray-300'
                        }`}>
                          {category.label}
                        </h5>

                        {/* Description */}
                        <p className="text-xs text-gray-500">
                          {category.description}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Selected tags preview */}
                <AnimatePresence initial={false}>
                  {profileData.categoryTags.length > 0 ? (
                    <motion.div
                      key="selected-category-preview"
                      className="mt-6 border border-white/10 bg-white/5 p-4"
                      initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                      transition={PAGE_TRANSITION}
                    >
                      <p className="mb-2 text-sm text-gray-400">your content will appear in:</p>
                      <div className="flex flex-wrap gap-2">
                        <AnimatePresence initial={false}>
                          {profileData.categoryTags.map((tag, index) => {
                            const category = categories.find((c) => c.id === tag);
                            const Icon = category?.icon;
                            return (
                              <motion.div
                                key={tag}
                                layout
                                className="flex items-center gap-2 border border-white/20 bg-white/5 px-3 py-1.5"
                                initial={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(8px)" }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(6px)" }}
                                transition={{
                                  ...PAGE_TRANSITION,
                                  delay: index * 0.04,
                                }}
                              >
                                {Icon ? <Icon className="h-4 w-4" /> : null}
                                <span className="text-sm">{category?.label}</span>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              {!forceSetup ? (
                <div className="border-t border-white/10 pt-6 mt-6">
                  <div className="flex flex-col gap-4 border border-red-500/25 bg-red-500/[0.04] p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-base text-white">delete account</h4>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-400">
                        Permanently removes your profile and every upload connected to it.
                      </p>
                    </div>
                    <motion.button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount || isSaving}
                      className="inline-flex items-center justify-center gap-2 border border-red-400/40 px-4 py-3 text-sm uppercase tracking-[0.16em] text-red-200 transition-colors hover:border-red-300/70 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>
                        {isDeletingAccount
                          ? "deleting..."
                          : deleteAccountConfirmStep > 0
                            ? "confirm delete"
                            : "delete account"}
                      </span>
                    </motion.button>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-4 border-t border-white/10 pt-6 mt-6">
                <motion.button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="border border-white/40 px-8 py-3 hover:border-white/60 hover:bg-white/10 transition-all duration-300"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isSaving ? "saving..." : "save profile"}
                </motion.button>
                {!forceSetup && (
                  <motion.button
                    onClick={() => {
                      setIsEditing(false);
                      setProfileNotice({ type: "", message: "" });
                    }}
                    className="border border-white/20 px-8 py-3 hover:border-white/40 hover:bg-white/5 transition-all duration-300 text-gray-400"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    cancel
                  </motion.button>
                )}
              </div>
            </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isInitialArchiveLoading ? (
                <motion.div
                  key="profile-view-loading"
                  {...CONTENT_SWAP_ANIMATION}
                  transition={PAGE_TRANSITION}
                >
                  <ArchiveLoadingState
                    label="profile"
                    progress={loadingProgress}
                  />
                </motion.div>
              ) : selectedMediaItem ? (
                <motion.div
                  key={`profile-item-${selectedMediaItem.id}`}
                  {...PROFILE_PANEL_SWAP_ANIMATION}
                  transition={PAGE_TRANSITION}
                >
                  <MediaItemPage
                    item={selectedMediaItem}
                    isPlaying={isPlaying}
                    isActive={activeMusicItemId === selectedMediaItem.id}
                    currentTime={activeMusicItemId === selectedMediaItem.id ? currentTime : 0}
                    duration={activeMusicItemId === selectedMediaItem.id ? duration : 0}
                    onBack={closeMediaItemPage}
                    onEdit={openEditUploadModal}
                    onPlayPause={handlePlayMusicItem}
                    onAddToQueue={handleAddMusicItemToQueue}
                    onSeek={(nextTime) => handleSeekMusicItem(selectedMediaItem, nextTime)}
                    onSocialUpdate={(socialUpdate) => handleMediaSocialUpdate(selectedMediaItem.id, socialUpdate)}
                    profile={{
                      username: profileData.username,
                      displayName: profileData.displayName,
                    }}
                    galleryItems={
                      selectedMediaItem.mediaKind === "visual"
                        ? visualItems
                        : selectedMediaItem.mediaKind === "video"
                          ? videoItems
                          : []
                    }
                    formatUploadDate={formatUploadDate}
                    formatFileSize={formatFileSize}
                    formatReleaseType={formatReleaseType}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="profile-archive"
                  {...PROFILE_PANEL_SWAP_ANIMATION}
                  transition={PAGE_TRANSITION}
                >
                  <ProfileArchiveView
                    profile={{
                      username: profileData.username,
                      displayName: profileData.displayName,
                      email: profileData.email,
                      bio: profileData.bio,
                      avatarUrl: profileData.avatar,
                      followerCount: profileData.followerCount,
                      followingCount: profileData.followingCount,
                      categoryTags: profileData.categoryTags,
                    }}
                    items={mediaItemsWithSlugs}
                    isOwner
                    headerLabel="profile"
                    contentHeading="archive"
                    contentNotice={contentNotice}
                    isLoadingMedia={isLoadingMedia}
                    currentTrackId={activeMusicItemId}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    onOpenItem={openMediaItemPage}
                    onPlayTrack={handlePlayMusicItem}
                    onSeekTrack={handleSeekMusicItem}
                    onAddToQueue={handleAddMusicItemToQueue}
                    onShare={handleShareMusicItem}
                    onEditItem={openEditUploadModal}
                    onUpload={openUploadModal}
                    onOpenVisual={openVisualLightbox}
                    onOpenVideo={openVideoLightbox}
                    onOpenConnections={(view) => setConnectionsView(view)}
                    emptyCategoryPrompt="choose music, visual, or video in edit mode to start uploading content"
                    headerActions={
                      <div className="flex flex-wrap gap-3">
                        <motion.button
                          onClick={() => setIsEditing(true)}
                          className="flex items-center gap-2 border border-white/40 px-4 py-3 text-sm transition-all duration-300 hover:border-white/60 hover:bg-white/10"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Edit2 className="h-4 w-4" />
                          <span>account settings</span>
                        </motion.button>
                      </div>
                    }
                    headerBottomRight={
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <LikedTracksPanel
                          likedTracks={normalizedLikedTracks}
                          onOpenTrack={(track) =>
                            router.push(buildPublicMediaPath(track.artist.username, track.slug))
                          }
                        />
                      </div>
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setShowChangePassword(false);
            setProfileNotice({ type: "success", message: "Password updated successfully." });
          }}
          accountEmail={profileData.email}
        />
      )}

      {showUploadModal && uploadKind && (
        <UploadContentModal
          mediaKind={uploadKind}
          isSubmitting={isUploading}
          onClose={closeUploadModal}
          onSubmit={handleUploadContent}
        />
      )}

      {isUploading ? <UploadProgressModal progress={uploadProgress} /> : null}

      {showUploadCategoryModal ? (
        <UploadCategoryModal
          categoryTags={profileData.categoryTags}
          onClose={() => setShowUploadCategoryModal(false)}
          onSelect={openUploadForKind}
        />
      ) : null}

      <AnimatePresence>
        {editingMediaItem ? (
          <EditUploadModal
            item={editingMediaItem}
            releaseTracks={editingMediaItem?.releaseTracks || null}
            isSubmitting={isUpdatingMedia}
            isDeleting={deletingMediaItemId === editingMediaItem.id}
            onClose={() => {
              if (isUpdatingMedia || deletingMediaItemId === editingMediaItem.id) {
                return;
              }
              setEditingMediaItem(null);
            }}
            onSave={handleSaveMediaItem}
            onDelete={handleDeleteMediaItem}
            onDeleteTrack={handleDeleteMediaItem}
          />
        ) : null}
      </AnimatePresence>

      {avatarDraft ? (
        <ImageCropModal
          file={avatarDraft}
          title="crop profile image"
          description="Position your avatar inside the square frame. The final avatar stays tightly framed and clean across profile surfaces."
          confirmLabel="use profile image"
          shape="circle"
          outputSize={800}
          onClose={() => setAvatarDraft(null)}
          onConfirm={uploadAvatarFile}
        />
      ) : null}

      <VisualGalleryLightbox
        profile={{
          username: profileData.username,
          displayName: profileData.displayName,
        }}
        items={lightboxItems}
        currentIndex={lightboxState.index}
        onClose={() => setLightboxState({ kind: "", index: -1 })}
        onPrevious={() =>
          setLightboxState((current) => ({
            ...current,
            index:
              lightboxItems.length > 0
                ? (current.index - 1 + lightboxItems.length) % lightboxItems.length
                : -1,
          }))
        }
        onNext={() =>
          setLightboxState((current) => ({
            ...current,
            index: lightboxItems.length > 0 ? (current.index + 1) % lightboxItems.length : -1,
          }))
        }
      />

      {connectionsView ? (
        <ProfileConnectionsModal
          username={profileData.username}
          displayName={profileData.displayName}
          initialView={connectionsView}
          onClose={() => setConnectionsView(null)}
        />
      ) : null}
    </motion.div>
  );
}

