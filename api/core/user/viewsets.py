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
            return User.objects.all()
        
        return User.objects.filter(public_id=user.public_id)
    
    def get_object(self):
        try:
            obj = User.objects.get_object_by_public_id(self.kwargs["pk"])
        except Http404:
            raise NotFound("User does not exist.")

        return obj
