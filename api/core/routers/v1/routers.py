from django.urls import include, path

from .user_routers import router as user_router
from .auth_routers import router as auth_router

urlpatterns = [
    path("", include(user_router.urls)),
    path("", include(auth_router.urls))
]
