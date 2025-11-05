import pytest
import requests


class TestFlowiseContract:
    """Contract tests ensuring Flowise integration stability."""

    @pytest.fixture(scope="class")
    def flowise_url(self):
        return "http://localhost:3000"

    def test_health_endpoint(self, flowise_url):
        """Verify Flowise health check responds correctly."""
        try:
            response = requests.get(f"{flowise_url}/api/v1/ping", timeout=10)
            assert response.status_code == 200
        except requests.exceptions.ConnectionError:
            pytest.skip("Flowise service not available - this is an optional service")

    def test_ui_accessibility(self, flowise_url):
        """Verify Flowise UI is accessible and contains expected content."""
        try:
            response = requests.get(flowise_url, timeout=10)
            assert response.status_code == 200
            assert "flowise" in response.text.lower()
        except requests.exceptions.ConnectionError:
            pytest.skip("Flowise service not available - this is an optional service")

    def test_essential_api_endpoints(self, flowise_url):
        """Verify essential API endpoints exist (may require auth)."""
        endpoints = ["/api/v1/chatflows", "/api/v1/nodes", "/api/v1/credentials"]

        try:
            for endpoint in endpoints:
                response = requests.get(f"{flowise_url}{endpoint}", timeout=10)
                # 404 = endpoint missing (bad), 401/403 = auth required (acceptable)
                assert response.status_code != 404, f"Endpoint {endpoint} not found"
        except requests.exceptions.ConnectionError:
            pytest.skip("Flowise service not available - this is an optional service")

    def test_deeplink_compatibility(self, flowise_url):
        """Verify UI structure for 'Open in Clinic' deeplink compatibility."""
        try:
            response = requests.get(f"{flowise_url}/canvas", timeout=10)
            assert response.status_code == 200

            content = response.text.lower()
            required_elements = ["canvas", "workflow", "chatflow"]

            for element in required_elements:
                assert element in content, f"Missing UI element: {element}"
        except requests.exceptions.ConnectionError:
            pytest.skip("Flowise service not available - this is an optional service")
