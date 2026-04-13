import uuid

from django.db import models
from django.http import Http404
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin

from storages.backends.s3boto3 import S3Boto3Storage

from core.utils import UniqueFilePath


class UserManager(BaseUserManager):
    def get_object_by_public_id(self, public_id):
        try:
            return self.get(public_id=public_id)
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise Http404("User not found.")

    def _create_user(self, email, password, role, **kwargs):
        if not email:
            raise TypeError(f"{role.capitalize()}s must have an email.")
        if not password:
            raise TypeError(f"{role.capitalize()}s must have a password.")

        user = self.model(email=self.normalize_email(email), role=role, **kwargs)
        user.set_password(password)
        user.save(using=self._db)
        self._create_role_profile(user)
        return user

    def _create_role_profile(self, user):
        profile_model = None

        if user.role == User.Role.SUPERADMIN:
            from core.sadmin.models import SAdminProfile
            profile_model = SAdminProfile
        elif user.role == User.Role.ADMIN:
            from core.admin.models import AdminProfile
            profile_model = AdminProfile
        elif user.role == User.Role.SME:
            from core.sme.models import SMEProfile
            profile_model = SMEProfile
        elif user.role == User.Role.PRODUCTION_USER:
            from core.produ.models import ProduProfile
            profile_model = ProduProfile
        elif user.role == User.Role.VALIDATION_USER:
            from core.valiu.models import ValiuProfile
            profile_model = ValiuProfile

        if profile_model:
            profile_model.objects.get_or_create(user=user)

    def create_production_user(self, email, password=None, **kwargs):
        return self._create_user(email, password, role=User.Role.PRODUCTION_USER, **kwargs)

    def create_validation_user(self, email, password=None, **kwargs):
        return self._create_user(email, password, role=User.Role.VALIDATION_USER, **kwargs)

    def create_sme(self, email, password=None, **kwargs):
        return self._create_user(email, password, role=User.Role.SME, **kwargs)

    def create_admin(self, email, password=None, **kwargs):
        user = self._create_user(email, password, role=User.Role.ADMIN, **kwargs)
        user.is_staff = True
        user.save(using=self._db)
        return user

    def create_superadmin(self, email, password=None, **kwargs):
        user = self._create_user(email, password, role=User.Role.SUPERADMIN, **kwargs)
        user.is_superuser = True
        user.is_staff = True
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):

    class Role(models.TextChoices):
        SUPERADMIN = "SUPERADMIN"
        ADMIN = "ADMIN"
        SME = "SME"
        PRODUCTION_USER = "PRODUCTION_USER"
        VALIDATION_USER = "VALIDATION_USER"

    class Gender(models.TextChoices):
        MALE = "MALE"
        FEMALE = "FEMALE"
        
    public_id = models.UUIDField(db_index=True, unique=True, editable=False, default=uuid.uuid4)

    email = models.EmailField(db_index=True, unique=True, max_length=255)
    name = models.CharField(max_length=255)
    gender = models.CharField(max_length=20, choices=Gender.choices, blank=True, null=True)
    dob = models.DateField(blank=True, null=True)
    image = models.ImageField(upload_to=UniqueFilePath("profile/images"), blank=True, null=True, storage=S3Boto3Storage())

    is_active = models.BooleanField(default=True)
    is_superuser = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(blank=True, null=True)

    role = models.CharField(max_length=28, choices=Role.choices, db_index=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    objects = UserManager()

    def __str__(self):
        return f"{self.email}"
