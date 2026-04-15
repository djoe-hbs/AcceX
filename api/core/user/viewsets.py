from django.http import Http404

from rest_framework import status
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied

from core.user.models import User
from core.user.serializers import UserSerializer


class UserViewSet(viewsets.ModelViewSet):
    http_method_names = ["patch", "get", "delete"]
    permission_classes = (IsAuthenticated, )
    serializer_class = UserSerializer


    def get_queryset(self):
        user = self.request.user

        if user.is_staff:
            queryset = User.objects.all()
            role = self.request.query_params.get("role")
            is_active = self.request.query_params.get("is_active")

            if role:
                queryset = queryset.filter(role=role)

            if is_active is not None:
                queryset = queryset.filter(is_active=is_active.lower() == "true")

            return queryset
        
        return User.objects.filter(public_id=user.public_id)
    
    def get_object(self):
        try:
            obj = User.objects.get_object_by_public_id(self.kwargs["pk"])
        except Http404:
            raise NotFound("User does not exist.")

        return obj
