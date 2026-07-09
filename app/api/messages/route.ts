import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  ensureAppUser,
  ensureProfile,
  getAuthContext,
} from "@/lib/supabase/app-user";
import { createSignedAvatarUrl } from "@/lib/messages/avatar";

const CONVERSATION_LIMIT = 40;
const MESSAGE_LIMIT = 80;
const MAX_MESSAGE_LENGTH = 2000;
const MESSAGE_SCHEMA_ERROR =
  "Messaging tables are not available yet. Apply the messaging migrations in db/migrations to Supabase, then reload the schema cache.";

type ConversationRow = {
  id: string;
  last_message_at: string;
  created_at: string;
};

type ConversationParticipantRow = {
  conversation_id: string;
  last_read_at?: string | null;
  hidden_at?: string | null;
};

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString();
}

function cleanMessageBody(value: unknown) {
  const body = String(value || "").trim();
  if (!body) return "";
  return body.slice(0, MAX_MESSAGE_LENGTH);
}

function isMissingMessagingSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.includes("message_conversation_participants") ||
    message.includes("message_conversations") ||
    message.includes("public.messages") ||
    message.includes("hidden_at")
  ) && message.toLowerCase().includes("schema cache");
}

function createErrorResponse(error: unknown) {
  if (isMissingMessagingSchemaError(error)) {
    return NextResponse.json({ error: MESSAGE_SCHEMA_ERROR }, { status: 503 });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return NextResponse.json({ error: message }, { status: 500 });
}

async function ensureConversationParticipant(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  conversationId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("message_conversation_participants")
    .select("conversation_id, hidden_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function getConversationParticipant(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  conversationId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("message_conversation_participants")
    .select("conversation_id, hidden_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ConversationParticipantRow | null;
}

async function findDirectConversation(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  firstUserId: string,
  secondUserId: string,
) {
  // Direct messages are one thread per pair of users. Find the overlap instead
  // of trusting a client-supplied conversation id.
  const { data: firstRows, error: firstError } = await supabase
    .from("message_conversation_participants")
    .select("conversation_id")
    .eq("user_id", firstUserId);

  if (firstError) {
    throw new Error(firstError.message);
  }

  const conversationIds = (firstRows ?? []).map((row) => row.conversation_id).filter(Boolean);
  if (conversationIds.length === 0) {
    return null;
  }

  const { data: secondRows, error: secondError } = await supabase
    .from("message_conversation_participants")
    .select("conversation_id")
    .eq("user_id", secondUserId)
    .in("conversation_id", conversationIds);

  if (secondError) {
    throw new Error(secondError.message);
  }

  return secondRows?.[0]?.conversation_id ?? null;
}

async function createDirectConversation(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  firstUserId: string,
  secondUserId: string,
) {
  // The API owns conversation creation so browser clients never need direct
  // insert access to the messaging tables.
  const { data: conversation, error: conversationError } = await supabase
    .from("message_conversations")
    .insert({})
    .select("id")
    .single();

  if (conversationError || !conversation?.id) {
    throw new Error(conversationError?.message ?? "Failed to create conversation.");
  }

  const { error: participantError } = await supabase
    .from("message_conversation_participants")
    .insert([
      { conversation_id: conversation.id, user_id: firstUserId },
      { conversation_id: conversation.id, user_id: secondUserId },
    ]);

  if (participantError) {
    throw new Error(participantError.message);
  }

  return conversation.id as string;
}

async function buildConversations(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
) {
  // Build the inbox from the user's participant rows first; everything else is
  // joined from that bounded set so private threads do not leak across users.
  const { data: participantRows, error: participantError } = await supabase
    .from("message_conversation_participants")
    .select("conversation_id, last_read_at, hidden_at")
    .eq("user_id", userId);

  if (participantError) {
    throw new Error(participantError.message);
  }

  const ownParticipants = participantRows ?? [];
  const conversationIds = ownParticipants.map((row) => row.conversation_id).filter(Boolean);
  if (conversationIds.length === 0) {
    return { conversations: [], unreadCount: 0 };
  }

  const [
    { data: conversations, error: conversationsError },
    { data: allParticipants, error: allParticipantsError },
    { data: latestMessages, error: latestMessagesError },
  ] = await Promise.all([
    supabase
      .from("message_conversations")
      .select("id, last_message_at, created_at")
      .in("id", conversationIds)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("message_conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds),
    supabase
      .from("messages")
      .select("id, conversation_id, sender_user_id, body, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);

  if (conversationsError) throw new Error(conversationsError.message);
  if (allParticipantsError) throw new Error(allParticipantsError.message);
  if (latestMessagesError) throw new Error(latestMessagesError.message);

  const orderedConversations = (conversations ?? []) as ConversationRow[];
  const ownReadAtByConversationId = new Map(
    ownParticipants.map((row) => [row.conversation_id, row.last_read_at as string | null]),
  );
  const ownHiddenAtByConversationId = new Map(
    ownParticipants.map((row) => [row.conversation_id, row.hidden_at as string | null]),
  );
  const latestMessageByConversationId = new Map<string, {
    id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
  }>();

  for (const message of latestMessages ?? []) {
    const hiddenAt = ownHiddenAtByConversationId.get(message.conversation_id);
    if (hiddenAt && new Date(message.created_at).getTime() <= new Date(hiddenAt).getTime()) {
      continue;
    }

    if (!latestMessageByConversationId.has(message.conversation_id)) {
      latestMessageByConversationId.set(message.conversation_id, message);
    }
  }

  // Deleting a conversation is per-user: it hides everything up to hidden_at
  // for this participant, while newer messages can revive the thread later.
  const visibleConversations = orderedConversations.filter((conversation) => {
    const hiddenAt = ownHiddenAtByConversationId.get(conversation.id);
    return !hiddenAt || latestMessageByConversationId.has(conversation.id);
  });
  const visibleConversationIds = visibleConversations.map((entry) => entry.id);

  const otherUserIds = [
    ...new Set(
      (allParticipants ?? [])
        .filter((row) => row.user_id !== userId && visibleConversationIds.includes(row.conversation_id))
        .map((row) => row.user_id),
    ),
  ];

  const profilesByUserId = new Map<string, {
    userId: string;
    username: string;
    displayName: string;
    avatarAssetId: string | null;
    avatarUrl: string | null;
  }>();

  if (otherUserIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_asset_id")
      .in("user_id", otherUserIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    for (const profile of profiles ?? []) {
      profilesByUserId.set(profile.user_id, {
        userId: profile.user_id,
        username: profile.username,
        displayName: profile.display_name,
        avatarAssetId: profile.avatar_asset_id,
        avatarUrl: null,
      });
    }

    await Promise.all(
      [...profilesByUserId.entries()].map(async ([profileUserId, profile]) => {
        const avatarUrl = await createSignedAvatarUrl(supabase, profile.avatarAssetId);
        profilesByUserId.set(profileUserId, { ...profile, avatarUrl });
      }),
    );
  }

  const otherUserIdByConversationId = new Map<string, string>();
  for (const participant of allParticipants ?? []) {
    if (participant.user_id !== userId && !otherUserIdByConversationId.has(participant.conversation_id)) {
      otherUserIdByConversationId.set(participant.conversation_id, participant.user_id);
    }
  }

  let unreadCount = 0;
  const items = visibleConversations.slice(0, CONVERSATION_LIMIT).map((conversation) => {
    const latestMessage = latestMessageByConversationId.get(conversation.id);
    const ownReadAt = ownReadAtByConversationId.get(conversation.id);
    const isUnread = Boolean(
      latestMessage &&
        latestMessage.sender_user_id !== userId &&
        (!ownReadAt || new Date(latestMessage.created_at).getTime() > new Date(ownReadAt).getTime()),
    );

    if (isUnread) {
      unreadCount += 1;
    }

    const otherUserId = otherUserIdByConversationId.get(conversation.id);
    const otherUser = otherUserId ? profilesByUserId.get(otherUserId) : null;

    return {
      id: conversation.id,
      updatedAt: conversation.last_message_at,
      updatedAtLabel: formatRelativeTime(conversation.last_message_at),
      isUnread,
      participant: otherUser
        ? {
            userId: otherUser.userId,
            username: otherUser.username,
            displayName: otherUser.displayName,
            avatarUrl: otherUser.avatarUrl,
          }
        : null,
      lastMessage: latestMessage
        ? {
            id: latestMessage.id,
            body: latestMessage.body,
            createdAt: latestMessage.created_at,
            isOwn: latestMessage.sender_user_id === userId,
          }
        : null,
    };
  });

  return { conversations: items, unreadCount };
}

async function buildThread(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  conversationId: string,
  userId: string,
) {
  // Service role bypasses RLS, so keep the membership check close to the read.
  const participant = await getConversationParticipant(supabase, conversationId, userId);
  if (!participant) {
    return null;
  }

  let messageQuery = supabase
    .from("messages")
    .select("id, sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(MESSAGE_LIMIT);

  if (participant.hidden_at) {
    messageQuery = messageQuery.gt("created_at", participant.hidden_at);
  }

  const { data: messages, error: messagesError } = await messageQuery;

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  return (messages ?? []).map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.created_at,
    createdAtLabel: formatRelativeTime(message.created_at),
    isOwn: message.sender_user_id === userId,
  }));
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    const supabase = createSupabaseServiceRoleClient();
    const base = await buildConversations(supabase, userId);

    if (!conversationId) {
      return NextResponse.json(base);
    }

    const thread = await buildThread(supabase, conversationId, userId);
    if (!thread) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    return NextResponse.json({ ...base, activeConversationId: conversationId, messages: thread });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { userId } = await ensureAppUser(auth.authUserId, auth.email);
    await ensureProfile(userId, auth.email);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "send").trim();
    const supabase = createSupabaseServiceRoleClient();

    if (action === "mark-read") {
      const conversationId = String(body?.conversationId || "").trim();
      if (!conversationId) {
        return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
      }

      const isParticipant = await ensureConversationParticipant(supabase, conversationId, userId);
      if (!isParticipant) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }

      const { error } = await supabase
        .from("message_conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const response = await buildConversations(supabase, userId);
      return NextResponse.json({ ok: true, ...response });
    }

    if (action === "delete-conversation") {
      const conversationId = String(body?.conversationId || "").trim();
      if (!conversationId) {
        return NextResponse.json({ error: "Conversation is required." }, { status: 400 });
      }

      const participant = await getConversationParticipant(supabase, conversationId, userId);
      if (!participant) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }

      const hiddenAt = new Date().toISOString();
      const { error } = await supabase
        .from("message_conversation_participants")
        .update({ hidden_at: hiddenAt, last_read_at: hiddenAt })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const response = await buildConversations(supabase, userId);
      return NextResponse.json({ ok: true, activeConversationId: "", messages: [], ...response });
    }

    const messageBody = cleanMessageBody(body?.body);
    if (!messageBody) {
      return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
    }

    let conversationId = String(body?.conversationId || "").trim();
    const recipientUserId = String(body?.recipientUserId || "").trim();

    // A send is either into a thread the user already belongs to, or it starts
    // a direct thread with a real recipient. No mystery third option, thankfully.
    if (conversationId) {
      const isParticipant = await ensureConversationParticipant(supabase, conversationId, userId);
      if (!isParticipant) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }
    } else {
      if (!recipientUserId) {
        return NextResponse.json({ error: "Recipient is required." }, { status: 400 });
      }

      if (recipientUserId === userId) {
        return NextResponse.json({ error: "You cannot message yourself." }, { status: 400 });
      }

      const { data: recipientProfile, error: recipientError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", recipientUserId)
        .maybeSingle();

      if (recipientError) {
        return NextResponse.json({ error: recipientError.message }, { status: 500 });
      }

      if (!recipientProfile?.user_id) {
        return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
      }

      conversationId =
        (await findDirectConversation(supabase, userId, recipientUserId)) ??
        (await createDirectConversation(supabase, userId, recipientUserId));
    }

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_user_id: userId,
        body: messageBody,
      })
      .select("id, created_at")
      .single();

    if (messageError || !message?.id) {
      return NextResponse.json(
        { error: messageError?.message ?? "Failed to send message." },
        { status: 500 },
      );
    }

    await supabase
      .from("message_conversation_participants")
      .update({ last_read_at: message.created_at, hidden_at: null })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    const response = await buildConversations(supabase, userId);
    const thread = await buildThread(supabase, conversationId, userId);

    return NextResponse.json({
      ok: true,
      conversationId,
      messages: thread ?? [],
      ...response,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
