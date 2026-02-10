import { useState, useEffect } from "react";
import {
  Container,
  Paper,
  Title,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Text,
  Box,
  Alert,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  // Check if demo mode is enabled and auto-login
  useEffect(() => {
    const checkDemoMode = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:8000/api"}/auth/demo-mode/`,
        );

        if (response.ok) {
          const data = await response.json();
          const isDemoMode = data.demo_mode || false;
          setDemoMode(isDemoMode);

          // Auto-login in demo mode
          if (isDemoMode) {
            setLoading(true);
            try {
              await login("", "");
              navigate("/");
            } catch (err: any) {
              setError(err.message || "Demo login failed.");
              setLoading(false);
            }
          }
        }
      } catch (err) {
        // Not demo mode or error checking
        setDemoMode(false);
      }
    };

    checkDemoMode();
  }, [login, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError("");
    setLoading(true);

    try {
      await login("", "");
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Demo login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={420} my={100}>
      <Box
        mb="xl"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <Box
          w={40}
          h={40}
          style={{
            borderRadius: 8,
            background: "linear-gradient(135deg, #7aa2ff, #9bffdd)",
          }}
        />
        <Title order={2}>Pipeline Studio</Title>
      </Box>

      <Paper withBorder shadow="md" p={30} radius="md">
        <Title order={3} mb="md" ta="center">
          Welcome back
        </Title>
        <Text c="dimmed" size="sm" ta="center" mb="xl">
          Sign in to access your ETL pipelines
        </Text>

        {demoMode && (
          <Alert color="blue" mb="md">
            Demo mode is enabled - you can login without credentials
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack>
            {error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Authentication failed"
                color="red"
              >
                {error}
              </Alert>
            )}

            <TextInput
              label="Username"
              placeholder="Enter your username"
              required={!demoMode}
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
            />

            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              required={!demoMode}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />

            <Button type="submit" fullWidth loading={loading}>
              Sign in
            </Button>

            {demoMode && (
              <Button
                variant="light"
                fullWidth
                loading={loading}
                onClick={handleDemoLogin}
              >
                Continue in Demo Mode
              </Button>
            )}
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
