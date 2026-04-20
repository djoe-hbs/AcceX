from rest_framework.routers import DefaultRouter

from core.chat.viewsets import ChatThreadViewSet

router = DefaultRouter()

router.register(r"chat/thread", ChatThreadViewSet, basename="chat-thread")
