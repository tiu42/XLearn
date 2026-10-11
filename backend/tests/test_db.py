import pytest


@pytest.mark.parametrize("url", [
    "postgresql://u:p@h:5432/d",
    "postgres://u:p@h:5432/d",  # dạng Railway/Heroku cung cấp
])
def test_url_postgres_dung_driver_psycopg(url):
    from app.db import normalize_url

    assert normalize_url(url).drivername == "postgresql+psycopg"


def test_url_dbms_khac_giu_nguyen():
    from app.db import normalize_url

    assert normalize_url("mysql+pymysql://u:p@h/d").drivername == "mysql+pymysql"


def test_get_db_tra_session_dung_engine(sqlite_engine):
    from app.db import get_db

    gen = get_db(sqlite_engine)
    session = next(gen)
    assert session.get_bind() is sqlite_engine
    gen.close()


def test_model_sinh_ddl_tren_dbms_khac(sqlite_engine):
    """create_all trên SQLite: model không phụ thuộc cú pháp riêng của Postgres."""
    from sqlalchemy import inspect

    from app.models import Base

    Base.metadata.create_all(sqlite_engine)
    assert set(inspect(sqlite_engine).get_table_names()) == set(Base.metadata.tables)
    assert len(Base.metadata.tables) == 14
