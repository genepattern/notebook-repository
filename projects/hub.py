from sqlalchemy import create_engine


class HubDatabase:
    db_url = 'sqlite:///jupyterhub.sqlite'  # TODO: Make this a traitlet or load directly from JupyterHub config
    echo = True

    def user_spawners(self, username):
        """Read the user spawners from the database"""
        # Establish a connection to the database
        engine = create_engine(self.db_url, echo=self.echo)
        session = engine.connect()

        # Query for the list of user spawners
        results = [r for r in session.execute(f"SELECT s.name, s.state, s.user_options FROM spawners s, users u WHERE s.user_id = u.id AND u.name = '{username}'")]

        # Close the connection to the database and return
        session.close()
        return results


# Initialize the database singletons
hub_db = HubDatabase()
