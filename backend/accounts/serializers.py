from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import validate_profile_picture

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()
    profile_picture = serializers.ImageField(write_only=True, required=False, validators=[validate_profile_picture])
    remove_profile_picture = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ("id", "email", "full_name", "default_voice", "profile_picture", "profile_picture_url", "remove_profile_picture")
        read_only_fields = ("id", "email")

    def get_profile_picture_url(self, user):
        return "/auth/profile/picture/" if user.profile_picture else None

    def validate(self, attrs):
        if attrs.get("profile_picture") and attrs.get("remove_profile_picture"):
            raise serializers.ValidationError("Upload a new picture or remove the current one, not both.")
        return attrs

    def update(self, instance, validated_data):
        remove_picture = validated_data.pop("remove_profile_picture", False)
        old_name = instance.profile_picture.name if instance.profile_picture else None
        if remove_picture:
            validated_data["profile_picture"] = ""
        user = super().update(instance, validated_data)
        if old_name and (remove_picture or ("profile_picture" in validated_data and user.profile_picture.name != old_name)):
            user.profile_picture.storage.delete(old_name)
        return user


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ("id", "email", "full_name", "default_voice", "password", "confirm_password")
        read_only_fields = ("id",)

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(username=attrs["email"], password=attrs["password"])
        if user is None:
            raise serializers.ValidationError("Invalid email or password.")
        attrs["user"] = user
        return attrs
