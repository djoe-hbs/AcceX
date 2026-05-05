from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.client.models import Client
from core.permissions import is_superadmin
from core.work.models import WorkClientInvoice
from core.work.serializers import (
    WorkClientInvoiceSerializer,
    GenerateClientInvoiceSerializer,
    GenerateMonthlyInvoicesSerializer,
    SendInvoiceEmailSerializer,
)
from core.work.services import (
    generate_client_invoice,
    generate_monthly_client_invoices,
    send_client_invoice_email,
)


class WorkInvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkClientInvoiceSerializer
    permission_classes = (IsAuthenticated,)
    http_method_names = ["get", "post"]

    def _ensure_superadmin(self):
        if not is_superadmin(self.request.user):
            raise PermissionDenied("Only superadmin can access invoices.")

    def get_queryset(self):
        self._ensure_superadmin()

        queryset = WorkClientInvoice.objects.select_related("client", "generated_by").prefetch_related(
            "items",
            "items__batch",
            "items__work_file",
        ).all()

        client_id = self.request.query_params.get("client_id")
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")

        if client_id:
            queryset = queryset.filter(client__public_id=client_id)
        if year:
            queryset = queryset.filter(year=year)
        if month:
            queryset = queryset.filter(month=month)

        return queryset

    def get_object(self):
        self._ensure_superadmin()

        try:
            return WorkClientInvoice.objects.select_related("client", "generated_by").prefetch_related(
                "items",
                "items__batch",
                "items__work_file",
            ).get(public_id=self.kwargs["pk"])
        except (ObjectDoesNotExist, ValueError, TypeError):
            raise NotFound("Invoice does not exist.")

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        self._ensure_superadmin()

        serializer = GenerateClientInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        client = Client.objects.get(public_id=serializer.validated_data["client_id"])
        invoice = generate_client_invoice(
            client=client,
            year=serializer.validated_data["year"],
            month=serializer.validated_data["month"],
            generated_by=request.user,
            trigger=WorkClientInvoice.Trigger.MANUAL,
        )

        if serializer.validated_data["send_email"]:
            send_client_invoice_email(invoice)

        return Response(WorkClientInvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="generate-monthly")
    def generate_monthly(self, request):
        self._ensure_superadmin()

        serializer = GenerateMonthlyInvoicesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        now = timezone.localdate()
        year = serializer.validated_data.get("year", now.year)
        month = serializer.validated_data.get("month", now.month)
        send_email = serializer.validated_data["send_email"]

        invoices = generate_monthly_client_invoices(
            year=year,
            month=month,
            generated_by=request.user,
            send_email=send_email,
        )

        data = WorkClientInvoiceSerializer(invoices, many=True).data
        return Response({"count": len(data), "results": data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="send-email")
    def send_email(self, request, pk=None):
        self._ensure_superadmin()

        invoice = self.get_object()
        serializer = SendInvoiceEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sent = send_client_invoice_email(invoice, recipients=serializer.validated_data.get("recipients"))
        if not sent:
            return Response(
                {"detail": "Invoice email was not sent. Check SMTP settings and recipients."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"detail": "Invoice email sent."}, status=status.HTTP_200_OK)
