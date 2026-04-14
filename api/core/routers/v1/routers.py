from django.urls import include, path

from .user_routers import router as user_router
from .auth_routers import router as auth_router
from .client_routers import router as client_router
from .work_routers import router as work_router

urlpatterns = [
    path("", include(user_router.urls)),
    path("", include(auth_router.urls)),
    path("", include(client_router.urls)),
    path("", include(work_router.urls)),
]
