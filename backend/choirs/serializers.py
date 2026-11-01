import re

from rest_framework import serializers

from .models import Choir


class ChoirSerializer(serializers.ModelSerializer):
    class Meta:
        model = Choir
        fields = (
            "id", "name", "description", "color", "voice_classification", "custom_voice",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a choir name.")
        user = self.context["request"].user
        matches = Choir.objects.filter(user=user, name__iexact=value)
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("You already have a choir with this name.")
        return value

    def validate_color(self, value):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise serializers.ValidationError("Use a six-digit hex color, such as #728b72.")
        return value.lower()

    def validate(self, attrs):
        voice = attrs.get("voice_classification", getattr(self.instance, "voice_classification", Choir.Voice.CUSTOM))
        custom_voice = attrs.get("custom_voice", getattr(self.instance, "custom_voice", ""))
        if voice == Choir.Voice.CUSTOM and not custom_voice.strip():
            raise serializers.ValidationError({"custom_voice": "Describe your voice part when Custom is selected."})
        if voice != Choir.Voice.CUSTOM:
            attrs["custom_voice"] = ""
        elif "custom_voice" in attrs:
            attrs["custom_voice"] = attrs["custom_voice"].strip()
        return attrs
