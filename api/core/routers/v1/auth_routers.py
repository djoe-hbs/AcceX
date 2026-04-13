from rest_framework.routers import DefaultRouter

from core.auth.viewsets import LoginViewSet
from core.auth.viewsets import CreateUserViewSet
from core.auth.viewsets import ChangePasswordViewSet

router = DefaultRouter()

router.register(r"auth/login", LoginViewSet, basename="auth-login")
router.register(r"auth/password/change-password", ChangePasswordViewSet, basename="auth-password-change-password")
router.register(r"auth/user/create-user", CreateUserViewSet, basename="auth-user-create-user")
