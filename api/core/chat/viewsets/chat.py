from django.db.models import Q, Count
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.user.models import User
from core.chat.models import ChatThread, ChatMessage
from core.chat.serializers import (
    ChatThreadSerializer,
    CreateThreadSerializer,
    ChatUserSerializer,
    ChatMessageSerializer,
    SendMessageSerializer,
)

CHAT_ELIGIBLE_ROLES = {User.Role.SME, User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER}


class ThreadPagination(PageNumberPagination):
    page_size = 15


class MessagePagination(PageNumberPagination):
    page_size = 20


class ChatThreadViewSet(viewsets.ViewSet):
    permission_classes = (IsAuthenticated,)

    def _check_chat_access(self, user):
        if user.role not in CHAT_ELIGIBLE_ROLES:
            raise PermissionDenied("Your role does not have chat access.")

    def _get_thread(self, pk, user):
        try:
            thread = ChatThread.objects.select_related(
                "participant_1", "participant_2",
            ).get(
                public_id=pk,
            )
        except (ChatThread.DoesNotExist, ValueError, TypeError):
            raise NotFound("Thread not found.")

        if thread.participant_1_id != user.id and thread.participant_2_id != user.id:
            raise PermissionDenied("You are not a participant of this thread.")

        return thread

    def list(self, request):
        self._check_chat_access(request.user)
        user = request.user

        threads = (
            ChatThread.objects.filter(
                Q(participant_1=user) | Q(participant_2=user)
            )
            .select_related("participant_1", "participant_2")
            .prefetch_related("messages")
            .annotate(
                unread_count=Count(
                    "messages",
                    filter=Q(messages__read_at__isnull=True) & ~Q(messages__sender=user),
                )
            )
            .order_by("-updated")
        )

        paginator = ThreadPagination()
        page = paginator.paginate_queryset(threads, request)
        serializer = ChatThreadSerializer(
            page, many=True, context={"request": request}
        )
        return paginator.get_paginated_response(serializer.data)

    def create(self, request):
        self._check_chat_access(request.user)

        serializer = CreateThreadSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        thread = serializer.save()

        return Response(
            ChatThreadSerializer(thread, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def retrieve(self, request, pk=None):
        self._check_chat_access(request.user)
        thread = self._get_thread(pk, request.user)
        serializer = ChatThreadSerializer(thread, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        self._check_chat_access(request.user)
        thread = self._get_thread(pk, request.user)

        if request.method == "GET":
            msgs = (
                thread.messages
                .select_related("sender")
                .order_by("-created")
            )

            # Mark unread messages from the other party as read
            thread.messages.filter(
                read_at__isnull=True,
            ).exclude(sender=request.user).update(read_at=timezone.now())

            paginator = MessagePagination()
            page = paginator.paginate_queryset(msgs, request)
            serializer = ChatMessageSerializer(
                page, many=True, context={"request": request}
            )
            return paginator.get_paginated_response(serializer.data)

        # POST — send a message
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        msg = ChatMessage.objects.create(
            thread=thread,
            sender=request.user,
            body=serializer.validated_data["body"],
        )

        # Bump thread.updated so it sorts to the top
        thread.save(update_fields=["updated"])

        return Response(
            ChatMessageSerializer(msg, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="eligible-users")
    def eligible_users(self, request):
        self._check_chat_access(request.user)
        user = request.user

        if user.role in (User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER):
            eligible = User.objects.filter(role=User.Role.SME, is_active=True)
        else:
            # SME can chat with other SMEs + production + validation
            eligible = User.objects.filter(
                role__in=[User.Role.SME, User.Role.PRODUCTION_USER, User.Role.VALIDATION_USER],
                is_active=True,
            ).exclude(pk=user.pk)

        data = ChatUserSerializer(eligible.order_by("name"), many=True).data
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        if request.user.role not in CHAT_ELIGIBLE_ROLES:
            return Response({"count": 0}, status=status.HTTP_200_OK)

        count = ChatMessage.objects.filter(
            read_at__isnull=True,
            thread__in=ChatThread.objects.filter(
                Q(participant_1=request.user) | Q(participant_2=request.user)
            ),
        ).exclude(sender=request.user).count()

        return Response({"count": count}, status=status.HTTP_200_OK)
