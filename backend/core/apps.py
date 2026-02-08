from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        """Initialize scheduler when Django starts."""
        # Only initialize scheduler in main process (not in migrations, etc.)
        import sys
        if 'runserver' in sys.argv or 'gunicorn' in sys.argv[0]:
            try:
                from .scheduler import reload_all_schedules
                # Delay loading to ensure database is ready
                import threading
                def init_scheduler():
                    import time
                    time.sleep(5)  # Wait for DB to be ready
                    try:
                        reload_all_schedules()
                    except Exception as e:
                        logger.error(f"Error reloading schedules: {e}")
                
                thread = threading.Thread(target=init_scheduler, daemon=True)
                thread.start()
                logger.info("Scheduler initialization scheduled")
            except Exception as e:
                logger.error(f"Failed to initialize scheduler: {e}")
