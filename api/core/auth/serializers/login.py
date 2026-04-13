from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login

from rest_framework import serializers
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.user.serializers import UserSerializer


class LoginSerializer(TokenObtainPairSerializer):
    device_identifier = serializers.CharField(required=False, write_only=True, allow_blank=True)

    def validate(self, attrs):
        email = attrs.get("email")
        password = attrs.get("password")

        user = authenticate(request=self.context.get("request"), username=email, password=password)
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
    
        refresh = self.get_token(user)
        access = refresh.access_token

        if api_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, user)

        profile_id = None
        if user.role == user.Role.SUPERADMIN:
            if hasattr(user, "sadmin_profile"):
                profile_id = user.sadmin_profile.public_id.hex
        elif user.role == user.Role.ADMIN:
            if hasattr(user, "admin_profile"):
                profile_id = user.admin_profile.public_id.hex
        elif user.role == user.Role.SME:
            if hasattr(user, "sme_profile"):
                profile_id = user.sme_profile.public_id.hex
        elif user.role == user.Role.PRODUCTION_USER:
            if hasattr(user, "produ_profile"):
                profile_id = user.produ_profile.public_id.hex
        elif user.role == user.Role.VALIDATION_USER:
            if hasattr(user, "valiu_profile"):
                profile_id = user.valiu_profile.public_id.hex

        data = {
            'refresh': str(refresh),
            'access': str(access),
            'user': UserSerializer(user).data,
            "profile": profile_id,
        }

        return data
