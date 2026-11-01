from rest_framework.routers import DefaultRouter

from .views import ChoirViewSet

router = DefaultRouter()
router.register("", ChoirViewSet, basename="choir")
urlpatterns = router.urls
