from django.urls import path, include

urlpatterns = [
    path("v1/", include("core.routers.v1.routers"))
]
