import { supabase } from '../lib/supabase';
import { isValidUUID } from '../lib/uuid';
import type { Conversation, ConversationStatus, ChatMessage, User } from '../types';

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const CLOSED_CHAT_NOTICE =
  'This conversation is closed because the delivery has been completed.';

function mapProfileToUser(p: any): User {
  return {
    id: p.id,
    name: p.full_name || p.organization_name || p.name || 'Partner',
    email: p.email || '',
    phone: p.phone || '',
    role: p.role || 'donor',
    avatar: p.avatar_url || p.avatar,
    isVerified: !!p.is_verified,
    totalDonations: p.total_donations || 0,
    totalRescues: p.total_rescues || 0,
    createdAt: p.created_at || new Date().toISOString(),
    updatedAt: p.updated_at || new Date().toISOString(),
  };
}

function mapMessageRow(m: any): ChatMessage {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    content: m.content,
    messageType: m.message_type || 'text',
    metadata: m.metadata || {},
    isRead: !!m.is_read,
    readAt: m.read_at || undefined,
    createdAt: m.created_at,
    sender: m.sender ? mapProfileToUser(m.sender) : undefined,
  };
}

function resolveConversationClosure(
  conv: any,
  linkedTask?: any,
  linkedListing?: any
): { status: ConversationStatus; closedAt?: string; deliveryStatus?: string } {
  const taskStatus: string | undefined = linkedTask?.status;
  const listingStatus: string | undefined = linkedListing?.status;
  const deliveryStatus = taskStatus || listingStatus;

  const isClosed =
    String(conv.status || '').toUpperCase() === 'CLOSED' ||
    Boolean(conv.closed_at) ||
    taskStatus === 'completed' ||
    (!taskStatus && conv.type === 'delivery' && listingStatus === 'completed');

  return {
    status: isClosed ? 'CLOSED' : 'ACTIVE',
    closedAt: isClosed
      ? conv.closed_at || linkedTask?.completed_at || linkedTask?.updated_at || linkedListing?.updated_at
      : undefined,
    deliveryStatus,
  };
}

export class ChatService {
  /**
   * Securely get or create the dedicated Donor <-> Assigned Rider conversation
   * for a specific food donation / delivery task.
   * Rejects opening a delivery chat before a rider is assigned.
   */
  static async openDeliveryConversation(
    currentUserId: string,
    recipientUserId: string,
    options: {
      relatedListingId?: string;
      relatedTaskId?: string;
      title?: string;
    }
  ): Promise<Conversation> {
    if (!isValidUUID(currentUserId)) {
      throw new Error('Authentication required');
    }

    const safeTaskId =
      isValidUUID(options.relatedTaskId) && options.relatedTaskId !== options.relatedListingId
        ? options.relatedTaskId
        : undefined;

    if (options.relatedListingId && isValidUUID(options.relatedListingId)) {
      const { data: rpcConvId, error: rpcErr } = await supabase.rpc(
        'get_or_create_delivery_conversation',
        {
          p_food_listing_id: options.relatedListingId,
          p_delivery_task_id: safeTaskId || null,
        }
      );

      if (!rpcErr && rpcConvId && isValidUUID(rpcConvId)) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', rpcConvId)
          .maybeSingle();
        if (conv) {
          return this.enrichConversation(conv, currentUserId);
        }
      }

      if (rpcErr && rpcErr.code !== 'PGRST202' && /Unauthorized/i.test(rpcErr.message || '')) {
        throw new Error(rpcErr.message);
      }
    }

    if (!isValidUUID(recipientUserId)) {
      throw new Error('No rider is currently assigned to this donation. Chat unlocks after acceptance.');
    }

    return this.getOrCreateDirectConversation(currentUserId, recipientUserId, {
      type: 'delivery',
      relatedListingId: options.relatedListingId,
      relatedTaskId: safeTaskId,
      title: options.title,
    });
  }

  /**
   * Find an existing conversation between participants or create a new one (idempotent — zero duplicates)
   */
  static async getOrCreateDirectConversation(
    currentUserId: string,
    recipientUserId: string,
    options?: {
      type?: 'direct' | 'donation' | 'delivery';
      relatedListingId?: string;
      relatedTaskId?: string;
      title?: string;
    }
  ): Promise<Conversation> {
    if (!isValidUUID(currentUserId) || !isValidUUID(recipientUserId)) {
      throw new Error('Valid participant IDs are required to start a conversation');
    }

    const type = options?.type || 'direct';
    const relatedListingId = isValidUUID(options?.relatedListingId) ? options?.relatedListingId : null;
    let relatedTaskId =
      isValidUUID(options?.relatedTaskId) && options?.relatedTaskId !== relatedListingId
        ? options?.relatedTaskId
        : null;

    // Verify relatedTaskId actually exists in delivery_tasks to prevent FK violations
    if (relatedTaskId) {
      const { data: taskExists } = await supabase
        .from('delivery_tasks')
        .select('id')
        .eq('id', relatedTaskId)
        .maybeSingle();
      if (!taskExists?.id) {
        relatedTaskId = null;
      }
    }

    // 1. Check if a conversation with these participants already exists for this task/listing
    const { data: userConvs } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (userConvs && userConvs.length > 0) {
      const convIds = userConvs.map((c) => c.conversation_id).filter(isValidUUID);

      if (convIds.length > 0) {
        const { data: sharedConvs } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', recipientUserId)
          .in('conversation_id', convIds);

        if (sharedConvs && sharedConvs.length > 0) {
          const sharedIds = sharedConvs.map((s) => s.conversation_id).filter(isValidUUID);
          const { data: candidateConvs } = await supabase
            .from('conversations')
            .select('*')
            .in('id', sharedIds)
            .order('created_at', { ascending: false });

          for (const conv of candidateConvs || []) {
            if (relatedTaskId && conv.related_task_id === relatedTaskId) {
              return this.enrichConversation(conv, currentUserId);
            }
            if (relatedListingId && conv.related_listing_id === relatedListingId) {
              return this.enrichConversation(conv, currentUserId);
            }
            if (!relatedListingId && !relatedTaskId && conv.type === 'direct') {
              return this.enrichConversation(conv, currentUserId);
            }
          }
        }
      }
    }

    // 2. Create new conversation using client-generated UUID WITHOUT .select()
    // so conv_participant_select RLS never blocks RETURNING * before participants are inserted!
    const nowIso = new Date().toISOString();
    const newConvId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

    const basePayload: Record<string, any> = {
      id: newConvId,
      type,
      related_listing_id: relatedListingId,
      related_task_id: relatedTaskId,
      title: options?.title || null,
      last_message_at: nowIso,
    };

    const { error: convErr } = await supabase.from('conversations').insert(basePayload);
    if (convErr) {
      throw new Error(convErr.message || 'Failed to create conversation');
    }

    // 3. Insert current user FIRST (satisfies user_id = auth.uid() RLS),
    // then insert recipient SECOND (satisfies is_conversation_participant(conversation_id) RLS)
    const { error: selfPartErr } = await supabase
      .from('conversation_participants')
      .insert({ conversation_id: newConvId, user_id: currentUserId });

    if (selfPartErr) {
      throw new Error(selfPartErr.message || 'Failed to register current participant');
    }

    if (recipientUserId !== currentUserId) {
      const { error: peerPartErr } = await supabase
        .from('conversation_participants')
        .insert({ conversation_id: newConvId, user_id: recipientUserId });

      if (peerPartErr) {
        throw new Error(peerPartErr.message || 'Failed to register peer participant');
      }
    }

    // 4. Now SELECT passes conv_participant_select RLS cleanly
    const { data: fetchedConv } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', newConvId)
      .maybeSingle();

    return this.enrichConversation(
      fetchedConv || {
        ...basePayload,
        created_at: nowIso,
        updated_at: nowIso,
      },
      currentUserId
    );
  }

  /**
   * Enrich a single conversation with participants, delivery status, closure state,
   * partner online status, unread count, and last message.
   */
  private static async enrichConversation(conv: any, viewerUserId?: string): Promise<Conversation> {
    const [partRes, lastMsgRes, taskRes, listingRes] = await Promise.all([
      supabase
        .from('conversation_participants')
        .select('*, profiles:user_id(id, full_name, organization_name, role, avatar_url, phone)')
        .eq('conversation_id', conv.id),
      supabase
        .from('messages')
        .select('*, sender:sender_id(id, full_name, organization_name, avatar_url, role)')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      isValidUUID(conv.related_task_id)
        ? supabase
            .from('delivery_tasks')
            .select('id, status, pickup_address, servings_required, food_title, donor_id, rider_id, completed_at, updated_at')
            .eq('id', conv.related_task_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      isValidUUID(conv.related_listing_id)
        ? supabase
            .from('food_listings')
            .select('id, title, status, pickup_address, servings, image_url, donor_id, assigned_rider_id, updated_at')
            .eq('id', conv.related_listing_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let linkedTask = taskRes.data;
    const linkedListing = listingRes.data;

    // If related_task_id wasn't set on conversation, look up latest non-cancelled task for the listing
    if (!linkedTask && isValidUUID(conv.related_listing_id)) {
      const { data: fallbackTask } = await supabase
        .from('delivery_tasks')
        .select('id, status, pickup_address, servings_required, food_title, donor_id, rider_id, completed_at, updated_at')
        .eq('food_listing_id', conv.related_listing_id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackTask) linkedTask = fallbackTask;
    }

    const mappedParticipants = (partRes.data || []).map((p: any) => ({
      id: p.id,
      conversationId: p.conversation_id,
      userId: p.user_id,
      role: p.role,
      lastReadAt: p.last_read_at,
      user: p.profiles ? mapProfileToUser(p.profiles) : undefined,
    }));

    // Check rider online status for the counterpart if counterpart is a rider
    let partnerIsOnline: boolean | undefined = undefined;
    const otherPart = viewerUserId
      ? mappedParticipants.find((p) => p.userId !== viewerUserId)
      : undefined;
    if (otherPart && (otherPart.role === 'rider' || otherPart.user?.role === 'rider')) {
      const { data: riderRow } = await supabase
        .from('riders')
        .select('is_online')
        .eq('user_id', otherPart.userId)
        .maybeSingle();
      if (riderRow && typeof riderRow.is_online === 'boolean') {
        partnerIsOnline = riderRow.is_online;
      }
    }

    let unreadQuery = supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('is_read', false);

    if (viewerUserId && isValidUUID(viewerUserId)) {
      unreadQuery = unreadQuery.neq('sender_id', viewerUserId);
    }

    const { count: unreadCount } = await unreadQuery;

    const { status, closedAt, deliveryStatus } = resolveConversationClosure(
      conv,
      linkedTask,
      linkedListing
    );

    const lastMsg = lastMsgRes.data;

    return {
      id: conv.id,
      type: conv.type,
      relatedListingId: conv.related_listing_id || undefined,
      relatedTaskId: conv.related_task_id || linkedTask?.id || undefined,
      donorId: conv.donor_id || linkedTask?.donor_id || linkedListing?.donor_id || undefined,
      riderId: conv.rider_id || undefined,
      status,
      closedAt,
      deliveryStatus,
      pickupAddress: linkedTask?.pickup_address || linkedListing?.pickup_address || undefined,
      donationServings: linkedTask?.servings_required || linkedListing?.servings || undefined,
      donationImageUrl: linkedListing?.image_url || undefined,
      partnerIsOnline,
      title: conv.title || linkedTask?.food_title || linkedListing?.title || undefined,
      lastMessageAt: conv.last_message_at,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      participants: mappedParticipants,
      unreadCount: unreadCount || 0,
      lastMessage: lastMsg ? mapMessageRow(lastMsg) : undefined,
    };
  }

  /**
   * Ensure conversations exist for any already-accepted delivery tasks or reservations
   * belonging to this donor or rider (recovers chats accepted via fallback paths).
   */
  private static async syncMissingAcceptedDeliveryConversations(
    userId: string,
    existingListingIds: Set<string>,
    existingTaskIds: Set<string>
  ): Promise<boolean> {
    let createdAny = false;
    try {
      // 1. Check accepted reservations where user is the accepting rider
      const { data: myRes } = await supabase
        .from('reservations')
        .select('id, food_listing_id, user_id, status')
        .eq('user_id', userId)
        .neq('status', 'cancelled')
        .limit(10);

      if (myRes && myRes.length > 0) {
        const missingListingIds = myRes
          .map((r: any) => r.food_listing_id)
          .filter((lid: string) => isValidUUID(lid) && !existingListingIds.has(lid));

        if (missingListingIds.length > 0) {
          const { data: listings } = await supabase
            .from('food_listings')
            .select('id, title, donor_id')
            .in('id', missingListingIds);

          for (const fl of listings || []) {
            if (fl.donor_id && fl.donor_id !== userId) {
              try {
                await this.getOrCreateDirectConversation(userId, fl.donor_id, {
                  type: 'delivery',
                  relatedListingId: fl.id,
                  title: fl.title || 'Food Pickup',
                });
                existingListingIds.add(fl.id);
                createdAny = true;
              } catch {}
            }
          }
        }
      }

      // 2. Check reservations on the user's own donated food listings (Donor side)
      const { data: myDonated } = await supabase
        .from('food_listings')
        .select('id, title, donor_id')
        .eq('donor_id', userId)
        .in('status', ['reserved', 'partially_reserved', 'picked_up', 'completed'])
        .limit(10);

      if (myDonated && myDonated.length > 0) {
        const missingDonorListingIds = myDonated
          .map((l: any) => l.id)
          .filter((lid: string) => isValidUUID(lid) && !existingListingIds.has(lid));

        if (missingDonorListingIds.length > 0) {
          const { data: peerRes } = await supabase
            .from('reservations')
            .select('food_listing_id, user_id, status')
            .in('food_listing_id', missingDonorListingIds)
            .neq('status', 'cancelled');

          const listingMap = new Map(myDonated.map((l: any) => [l.id, l]));
          for (const r of peerRes || []) {
            const fl = listingMap.get(r.food_listing_id);
            if (fl && r.user_id && r.user_id !== userId && !existingListingIds.has(fl.id)) {
              try {
                await this.getOrCreateDirectConversation(userId, r.user_id, {
                  type: 'delivery',
                  relatedListingId: fl.id,
                  title: fl.title || 'Food Pickup',
                });
                existingListingIds.add(fl.id);
                createdAny = true;
              } catch {}
            }
          }
        }
      }

      // 3. Check delivery_tasks assigned to this rider or donor
      const { data: riderRow } = await supabase
        .from('riders')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      const taskQueries: Promise<any>[] = [
        supabase
          .from('delivery_tasks')
          .select('id, food_listing_id, donor_id, rider_id, food_title, status')
          .eq('donor_id', userId)
          .neq('status', 'cancelled')
          .limit(10) as any,
      ];
      if (riderRow?.id) {
        taskQueries.push(
          supabase
            .from('delivery_tasks')
            .select('id, food_listing_id, donor_id, rider_id, food_title, status')
            .eq('rider_id', riderRow.id)
            .neq('status', 'cancelled')
            .limit(10) as any
        );
      }

      const taskResults = await Promise.all(taskQueries);
      const tasks = taskResults.flatMap((res) => res?.data || []);
      for (const dt of tasks) {
        if (!dt?.id || existingTaskIds.has(dt.id) || (dt.food_listing_id && existingListingIds.has(dt.food_listing_id))) {
          continue;
        }
        let peerUid: string | null = null;
        if (dt.donor_id === userId && dt.rider_id) {
          const { data: r } = await supabase
            .from('riders')
            .select('user_id')
            .eq('id', dt.rider_id)
            .maybeSingle();
          peerUid = r?.user_id || dt.rider_id;
        } else if (dt.donor_id && dt.donor_id !== userId) {
          peerUid = dt.donor_id;
        }

        if (peerUid && isValidUUID(peerUid) && peerUid !== userId) {
          try {
            await this.getOrCreateDirectConversation(userId, peerUid, {
              type: 'delivery',
              relatedListingId: dt.food_listing_id || undefined,
              relatedTaskId: dt.id,
              title: dt.food_title || 'Food Pickup',
            });
            existingTaskIds.add(dt.id);
            if (dt.food_listing_id) existingListingIds.add(dt.food_listing_id);
            createdAny = true;
          } catch {}
        }
      }
    } catch {}
    return createdAny;
  }

  /**
   * Fetch all conversations for an authenticated user (strictly filtered by participant membership)
   */
  static async getUserConversations(userId: string): Promise<Conversation[]> {
    if (!isValidUUID(userId)) return [];

    const fetchParticipantConvs = async () => {
      const { data: participantRows, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);

      if (error || !participantRows || participantRows.length === 0) {
        return [] as any[];
      }

      const convIds = Array.from(new Set(participantRows.map((r) => r.conversation_id).filter(isValidUUID)));
      if (convIds.length === 0) return [] as any[];

      const { data: convs, error: convsErr } = await supabase
        .from('conversations')
        .select('*')
        .in('id', convIds)
        .order('last_message_at', { ascending: false });

      return convsErr || !convs ? [] : convs;
    };

    let convs = await fetchParticipantConvs();

    // Sync any accepted delivery/reservation that hasn't materialized a chat thread yet
    const existingListingIds = new Set<string>(
      convs.map((c: any) => c.related_listing_id).filter(isValidUUID)
    );
    const existingTaskIds = new Set<string>(
      convs.map((c: any) => c.related_task_id).filter(isValidUUID)
    );

    const created = await this.syncMissingAcceptedDeliveryConversations(
      userId,
      existingListingIds,
      existingTaskIds
    );
    if (created) {
      convs = await fetchParticipantConvs();
    }

    if (convs.length === 0) return [];

    return Promise.all(convs.map((c) => this.enrichConversation(c, userId)));
  }

  /**
   * Get total unread incoming messages across all authorized conversations for a user.
   */
  static async getTotalUnreadCount(userId: string): Promise<number> {
    if (!isValidUUID(userId)) return 0;

    const { data: participantRows, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (error || !participantRows || participantRows.length === 0) return 0;

    const convIds = Array.from(new Set(participantRows.map((r) => r.conversation_id).filter(isValidUUID)));
    if (convIds.length === 0) return 0;

    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', convIds)
      .neq('sender_id', userId)
      .eq('is_read', false);

    return count || 0;
  }

  /**
   * Get unread message count for a specific food listing / delivery task conversation.
   */
  static async getUnreadCountForDelivery(
    userId: string,
    options: { relatedTaskId?: string; relatedListingId?: string }
  ): Promise<number> {
    if (!isValidUUID(userId)) return 0;

    let convId: string | null = null;
    if (isValidUUID(options.relatedTaskId)) {
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('related_task_id', options.relatedTaskId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      convId = data?.id || null;
    }

    if (!convId && isValidUUID(options.relatedListingId)) {
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('related_listing_id', options.relatedListingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      convId = data?.id || null;
    }

    if (!convId) return 0;

    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', convId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    return count || 0;
  }

  /**
   * Check whether a conversation is CLOSED (either via conversations.status or completed delivery task/listing).
   */
  static async isConversationClosed(conversationId: string): Promise<boolean> {
    if (!isValidUUID(conversationId)) return true;

    const { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();

    if (!conv) return true;

    if (String(conv.status || '').toUpperCase() === 'CLOSED' || Boolean(conv.closed_at)) {
      return true;
    }

    if (isValidUUID(conv.related_task_id)) {
      const { data: task } = await supabase
        .from('delivery_tasks')
        .select('status')
        .eq('id', conv.related_task_id)
        .maybeSingle();
      if (task?.status === 'completed') return true;
    } else if (isValidUUID(conv.related_listing_id) && conv.type === 'delivery') {
      const { data: listing } = await supabase
        .from('food_listings')
        .select('status')
        .eq('id', conv.related_listing_id)
        .maybeSingle();
      if (listing?.status === 'completed') return true;
    }

    return false;
  }

  /**
   * Automatically close the conversation associated with a completed delivery.
   * Works reliably both with and without the SQL migration applied.
   */
  static async closeConversationForDelivery(
    deliveryTaskId?: string | null,
    foodListingId?: string | null,
    actorUserId?: string | null
  ): Promise<void> {
    const validTaskId = isValidUUID(deliveryTaskId) ? deliveryTaskId : null;
    const validListingId = isValidUUID(foodListingId) ? foodListingId : null;
    if (!validTaskId && !validListingId) return;

    // 1. Try atomic backend RPC first
    try {
      const { error } = await supabase.rpc('close_conversation_for_delivery', {
        p_delivery_task_id: validTaskId,
        p_food_listing_id: validListingId,
      });
      if (!error) return;
    } catch {}

    // 2. Fallback: find linked conversation(s) and mark closed + post read-only system message
    try {
      const matchedIds = new Set<string>();
      if (validTaskId) {
        const { data } = await supabase
          .from('conversations')
          .select('id')
          .eq('related_task_id', validTaskId);
        (data || []).forEach((r: any) => r?.id && matchedIds.add(r.id));
      }
      if (validListingId) {
        const { data } = await supabase
          .from('conversations')
          .select('id')
          .eq('related_listing_id', validListingId)
          .eq('type', 'delivery');
        (data || []).forEach((r: any) => r?.id && matchedIds.add(r.id));
      }

      const nowIso = new Date().toISOString();
      for (const convId of matchedIds) {
        // Attempt status/closed_at update (ignored cleanly if columns not yet migrated)
        try {
          await supabase
            .from('conversations')
            .update({ status: 'CLOSED', closed_at: nowIso, updated_at: nowIso } as any)
            .eq('id', convId);
        } catch {}

        // Post single system closure message if not already logged
        if (isValidUUID(actorUserId)) {
          const { data: existingSys } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', convId)
            .eq('message_type', 'system')
            .ilike('content', '%conversation is now closed%')
            .limit(1);

          if (!existingSys || existingSys.length === 0) {
            await supabase.from('messages').insert({
              conversation_id: convId,
              sender_id: actorUserId,
              content:
                'Delivery Completed — This conversation is now closed. You can still view your previous messages.',
              message_type: 'system',
              is_read: true,
            });
          }
        }
      }
    } catch {}
  }

  /**
   * Get messages in an authorized conversation with optional cursor pagination
   * for older message history.
   */
  static async getMessages(
    conversationId: string,
    options?: { limit?: number; before?: string }
  ): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
    if (!isValidUUID(conversationId)) return { messages: [], hasMore: false };

    const limit = Math.min(Math.max(options?.limit ?? 100, 10), 200);
    let query = supabase
      .from('messages')
      .select('*, sender:sender_id(id, full_name, organization_name, avatar_url, role)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (options?.before) {
      query = query.lt('created_at', options.before);
    }

    const { data, error } = await query;
    if (error || !data) return { messages: [], hasMore: false };

    const hasMore = data.length > limit;
    const slice = hasMore ? data.slice(0, limit) : data;
    const chronological = slice.reverse().map(mapMessageRow);

    return { messages: chronological, hasMore };
  }

  /**
   * Send a new message with strict validation, closure enforcement, and timestamp update.
   */
  static async sendMessage(params: {
    conversationId: string;
    senderId: string;
    content: string;
    messageType?: 'text' | 'image' | 'location' | 'system';
    metadata?: Record<string, any>;
  }): Promise<ChatMessage> {
    if (!isValidUUID(params.conversationId) || !isValidUUID(params.senderId)) {
      throw new Error('Invalid conversation or sender ID');
    }

    const trimmed = (params.content || '').trim();
    if (!trimmed) {
      throw new Error('Message cannot be empty.');
    }
    if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
      throw new Error(`Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters.`);
    }

    // Enforce closure check before attempting insert (backed by Postgres RLS & trigger)
    if ((params.messageType || 'text') !== 'system') {
      const closed = await this.isConversationClosed(params.conversationId);
      if (closed) {
        throw new Error(CLOSED_CHAT_NOTICE);
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversationId,
        sender_id: params.senderId,
        content: trimmed,
        message_type: params.messageType || 'text',
        metadata: params.metadata || {},
      })
      .select('*, sender:sender_id(id, full_name, organization_name, avatar_url, role)')
      .single();

    if (error || !data) {
      if (/CONVERSATION_CLOSED|row-level security|new row violates/i.test(error?.message || '')) {
        throw new Error(CLOSED_CHAT_NOTICE);
      }
      throw new Error(error?.message || 'Failed to send message');
    }

    // Best-effort timestamp update (also handled by DB trigger when applied)
    try {
      await supabase
        .from('conversations')
        .update({ last_message_at: data.created_at, updated_at: data.created_at })
        .eq('id', params.conversationId);
    } catch {}

    return mapMessageRow(data);
  }

  /**
   * Mark incoming messages in a conversation as read (records read_at when column exists)
   */
  static async markMessagesAsRead(conversationId: string, currentUserId: string): Promise<void> {
    if (!isValidUUID(conversationId) || !isValidUUID(currentUserId)) return;
    const nowIso = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true, read_at: nowIso } as any)
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUserId)
        .eq('is_read', false);

      if (error && /read_at/i.test(error.message || '')) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('conversation_id', conversationId)
          .neq('sender_id', currentUserId)
          .eq('is_read', false);
      }

      await supabase
        .from('conversation_participants')
        .update({ last_read_at: nowIso })
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUserId);
    } catch {}
  }

  /**
   * Subscribe to incoming messages, read receipts, and real-time conversation/delivery closure
   * for a single active conversation. Cleans up completely on unmount.
   */
  static subscribeToMessages(
    conversationId: string,
    onMessage: (msg: ChatMessage) => void,
    onMessageUpdated?: (msg: { id: string; isRead: boolean; readAt?: string }) => void,
    options?: {
      relatedTaskId?: string;
      onConversationStatusChanged?: (update: {
        status: ConversationStatus;
        closedAt?: string;
        deliveryStatus?: string;
      }) => void;
    }
  ) {
    if (!isValidUUID(conversationId)) {
      return { unsubscribe: () => {} };
    }

    let channel = supabase
      .channel(`chat:${conversationId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as any;
          const { data: sender } = await supabase
            .from('profiles')
            .select('id, full_name, organization_name, avatar_url, role')
            .eq('id', row.sender_id)
            .maybeSingle();

          onMessage({
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            content: row.content,
            messageType: row.message_type || 'text',
            metadata: row.metadata || {},
            isRead: !!row.is_read,
            readAt: row.read_at || undefined,
            createdAt: row.created_at,
            sender: sender ? mapProfileToUser(sender) : undefined,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (onMessageUpdated && row?.id) {
            onMessageUpdated({
              id: row.id,
              isRead: !!row.is_read,
              readAt: row.read_at || undefined,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (options?.onConversationStatusChanged && row) {
            const isClosed =
              String(row.status || '').toUpperCase() === 'CLOSED' || Boolean(row.closed_at);
            if (isClosed) {
              options.onConversationStatusChanged({
                status: 'CLOSED',
                closedAt: row.closed_at || row.updated_at || new Date().toISOString(),
                deliveryStatus: 'completed',
              });
            }
          }
        }
      );

    if (isValidUUID(options?.relatedTaskId)) {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_tasks',
          filter: `id=eq.${options!.relatedTaskId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (options?.onConversationStatusChanged && row?.status) {
            const isCompleted = row.status === 'completed';
            options.onConversationStatusChanged({
              status: isCompleted ? 'CLOSED' : 'ACTIVE',
              closedAt: isCompleted ? row.completed_at || row.updated_at || new Date().toISOString() : undefined,
              deliveryStatus: row.status,
            });
          }
        }
      );
    }

    channel.subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  }

  /**
   * Subscribe to conversation list, unread badges, and delivery status changes in real time.
   */
  static subscribeToUserConversations(userId: string, onRefresh: () => void) {
    if (!isValidUUID(userId)) {
      return { unsubscribe: () => {} };
    }

    let timer: any = null;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(onRefresh, 350);
    };

    const channel = supabase
      .channel(`conv_list:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, debounced)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, debounced)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'delivery_tasks' }, debounced)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
        debounced
      )
      .subscribe();

    return {
      unsubscribe: () => {
        clearTimeout(timer);
        supabase.removeChannel(channel);
      },
    };
  }
}
